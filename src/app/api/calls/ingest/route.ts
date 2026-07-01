import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyApiToken } from "@/lib/tokens";
import { phoneTail } from "@/lib/phone";
import { applyCallStatusUpdate } from "@/lib/calls/handlers";
import { runIdleAgentCheck } from "@/lib/idle";
import { maybeAutoSyncSheet } from "@/lib/integrations/sheet-sync";

export const runtime = "nodejs";

/**
 * Android call types (CallLog.Calls.TYPE):
 *   INCOMING  = 1
 *   OUTGOING  = 2
 *   MISSED    = 3
 *   VOICEMAIL = 4
 *   REJECTED  = 5
 *   BLOCKED   = 6
 *   ANSWERED_EXTERNALLY = 7
 */
const itemSchema = z.object({
  phone: z.string().min(3),
  startedAt: z.string().datetime(),
  durationSec: z.number().int().nonnegative(),
  callType: z.enum(["INCOMING", "OUTGOING", "MISSED", "REJECTED", "VOICEMAIL", "BLOCKED", "ANSWERED_EXTERNALLY"]),
  /** Android CallLog._ID — used by the app to dedup if it ever re-sends a batch. */
  deviceCallId: z.string().optional(),
});

const bodySchema = z.object({
  calls: z.array(itemSchema).max(200),
});

function outcomeFromType(t: z.infer<typeof itemSchema>["callType"], dur: number) {
  if (t === "OUTGOING") return dur >= 3 ? "CONNECTED" : "NO_ANSWER";
  if (t === "MISSED" || t === "REJECTED" || t === "BLOCKED") return "NO_ANSWER";
  if (t === "INCOMING") return "CONNECTED";
  return "FAILED" as const;
}

function statusForHandler(t: z.infer<typeof itemSchema>["callType"], dur: number) {
  if (t === "OUTGOING") return dur >= 3 ? "completed" : "no-answer";
  if (t === "MISSED" || t === "REJECTED" || t === "BLOCKED") return "no-answer";
  if (t === "INCOMING") return "completed";
  return "failed";
}

export async function POST(req: NextRequest) {
  const user = await verifyApiToken(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "bad_request", detail: (e as Error).message.slice(0, 200) }, { status: 400 });
  }

  // Find leads assigned to this user. Manager-mode would skip the assignedToUserId filter.
  // We match by last-10 digits because the device log may include the country code or not.
  const tails = Array.from(new Set(parsed.calls.map((c) => phoneTail(c.phone)).filter(Boolean)));
  if (tails.length === 0) return NextResponse.json({ ok: true, created: 0, skipped: parsed.calls.length });

  const leads = await prisma.lead.findMany({
    where: user.role === "MANAGER"
      ? {}
      : { assignedToUserId: user.id },
    select: { id: true, phone: true, name: true },
  });
  const byTail = new Map<string, { id: string; phone: string }>();
  for (const l of leads) {
    const t = phoneTail(l.phone);
    if (t) byTail.set(t, { id: l.id, phone: l.phone });
  }

  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { phone: true } });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const results: Array<{ phone: string; status: string; leadId?: string; callId?: string }> = [];

  for (const item of parsed.calls) {
    const tail = phoneTail(item.phone);
    const match = tail ? byTail.get(tail) : undefined;
    if (!match) {
      skipped++;
      results.push({ phone: item.phone, status: "no_matching_lead" });
      continue;
    }

    const startedAt = new Date(item.startedAt);
    const endedAt = new Date(startedAt.getTime() + item.durationSec * 1000);

    // Dedup: same lead + user + startedAt within ±60s → upsert instead of duplicate.
    const existing = await prisma.call.findFirst({
      where: {
        leadId: match.id,
        userId: user.id,
        startedAt: {
          gte: new Date(startedAt.getTime() - 60_000),
          lte: new Date(startedAt.getTime() + 60_000),
        },
      },
      select: { id: true },
    });

    const direction = item.callType === "INCOMING" || item.callType === "VOICEMAIL" ? "INBOUND" : "OUTBOUND";
    const outcome = outcomeFromType(item.callType, item.durationSec);

    let callId: string;
    if (existing) {
      const u = await prisma.call.update({
        where: { id: existing.id },
        data: {
          provider: "android",
          durationSec: item.durationSec,
          endedAt,
          outcome,
          agentPhone: me?.phone ?? undefined,
          leadPhone: match.phone,
          providerCallSid: item.deviceCallId ? `android-${item.deviceCallId}` : existing.id,
        },
      });
      callId = u.id;
      updated++;
    } else {
      const c = await prisma.call.create({
        data: {
          leadId: match.id,
          userId: user.id,
          provider: "android",
          direction,
          startedAt,
          endedAt,
          durationSec: item.durationSec,
          outcome,
          agentPhone: me?.phone ?? undefined,
          leadPhone: match.phone,
          providerCallSid: item.deviceCallId ? `android-${item.deviceCallId}` : undefined,
        },
      });
      callId = c.id;
      created++;
    }

    // Run lead-side side effects (autoLabel / lastContactedAt / nextRedialAt)
    await applyCallStatusUpdate({
      callId,
      status: statusForHandler(item.callType, item.durationSec),
      duration: item.durationSec,
    });

    results.push({ phone: item.phone, status: existing ? "updated" : "created", leadId: match.id, callId });
  }

  // The app pings this every ~2 min, so it's a reliable place (on serverless,
  // where in-process schedulers don't run) to check if this salesperson has
  // gone quiet for too long and alert them + managers.
  try { await runIdleAgentCheck({ userId: user.id }); } catch { /* non-fatal */ }

  // Keep the Google Sheet(s) in sync without a cron (throttled internally).
  // Run it AFTER the response is sent so pulling several sheets can never delay
  // or time out (504) the phone's call-sync — which must always return fast.
  after(async () => {
    try { await maybeAutoSyncSheet(); } catch { /* non-fatal */ }
  });

  return NextResponse.json({ ok: true, created, updated, skipped, results });
}
