"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTelephonyProvider } from "@/lib/telephony";
import { applyCallStatusUpdate } from "@/lib/calls/handlers";
import type { CallOutcome, ManualLabel } from "@/generated/prisma/enums";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

async function getPublicBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0];
  return `${proto}://${host}`;
}

export async function startCallForLead(formData: FormData): Promise<void> {
  const user = await requireUser();
  const leadId = String(formData.get("leadId") ?? "");
  if (!leadId) redirect("/leads");

  // One round-trip for the lead, the agent's phone, and any open session.
  const [lead, me, existingSession] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, phone: true, assignedToUserId: true },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { phone: true } }),
    prisma.callSession.findFirst({ where: { userId: user.id, endedAt: null } }),
  ]);
  if (!lead) redirect("/leads");
  if (user.role !== "MANAGER" && lead.assignedToUserId !== user.id) redirect("/leads");

  const agentPhone = me?.phone;
  if (!agentPhone) {
    redirect(`/leads/${leadId}?error=${encodeURIComponent("Your account has no phone configured")}`);
  }

  // Auto-start a CallSession if one isn't open — clicking Call anywhere
  // means "I'm dialing right now", so we should track it.
  if (!existingSession) {
    await prisma.callSession.create({ data: { userId: user.id } });
  } else if (existingSession.pausedAt) {
    await prisma.callSession.update({
      where: { id: existingSession.id },
      data: { pausedAt: null },
    });
  }

  const mode = (process.env.TELEPHONY_PROVIDER ?? "direct").toLowerCase();

  const call = await prisma.call.create({
    data: {
      leadId,
      userId: user.id,
      provider: mode,
      direction: "OUTBOUND",
      outcome: "PENDING",
      agentPhone,
      leadPhone: lead.phone,
      fromNumber: mode === "twilio" ? process.env.TWILIO_FROM_NUMBER ?? null : null,
    },
    select: { id: true },
  });

  // Direct mode: salesperson dials from their own phone. We just track the row.
  if (mode === "direct") {
    revalidatePath("/dialer");
    redirect(`/dialer?activeCallId=${call.id}`);
  }

  // Twilio / mock — kick off the provider.
  const provider = getTelephonyProvider();
  const baseUrl = await getPublicBaseUrl();
  try {
    await provider.initiateCall({
      callId: call.id,
      agentPhone,
      leadPhone: lead.phone,
      publicBaseUrl: baseUrl,
    });
  } catch (e) {
    await prisma.call.update({
      where: { id: call.id },
      data: { outcome: "FAILED", endedAt: new Date(), feedbackNote: `Provider error: ${(e as Error).message.slice(0, 120)}` },
    });
    redirect(`/leads/${leadId}?error=${encodeURIComponent("Could not start the call")}`);
  }

  revalidatePath("/dialer");
  redirect(`/dialer?activeCallId=${call.id}`);
}

export async function startCallSession(): Promise<void> {
  const user = await requireUser();
  const existing = await prisma.callSession.findFirst({
    where: { userId: user.id, endedAt: null },
  });
  if (existing) {
    if (existing.pausedAt) {
      await prisma.callSession.update({
        where: { id: existing.id },
        data: { pausedAt: null },
      });
    }
    redirect("/dialer");
  }
  await prisma.callSession.create({ data: { userId: user.id } });
  redirect("/dialer");
}

export async function pauseCallSession(): Promise<void> {
  const user = await requireUser();
  const s = await prisma.callSession.findFirst({
    where: { userId: user.id, endedAt: null },
  });
  if (!s) redirect("/dialer");
  await prisma.callSession.update({
    where: { id: s.id },
    data: { pausedAt: s.pausedAt ? null : new Date() },
  });
  redirect("/dialer");
}

export async function endCallSession(): Promise<void> {
  const user = await requireUser();
  const s = await prisma.callSession.findFirst({
    where: { userId: user.id, endedAt: null },
  });
  if (s) {
    await prisma.callSession.update({
      where: { id: s.id },
      data: { endedAt: new Date(), pausedAt: null },
    });
  }
  redirect("/dialer");
}

export async function submitCallFeedback(formData: FormData): Promise<void> {
  const user = await requireUser();
  const callId = String(formData.get("callId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const labelRaw = String(formData.get("label") ?? "").trim();
  const redialIn = String(formData.get("redialIn") ?? "").trim(); // hours
  const outcomeRaw = String(formData.get("outcome") ?? "").trim().toUpperCase();
  const durationRaw = String(formData.get("durationSec") ?? "").trim();
  const ringRaw = String(formData.get("ringSec") ?? "").trim();

  const allowed: ManualLabel[] = ["DISPATCH", "BOOKED", "ORDERED", "PAID"];
  const label = (allowed as string[]).includes(labelRaw) ? (labelRaw as ManualLabel) : null;

  const allowedOutcomes: CallOutcome[] = ["CONNECTED", "NO_ANSWER", "BUSY", "FAILED"];
  const outcome = (allowedOutcomes as string[]).includes(outcomeRaw) ? (outcomeRaw as CallOutcome) : null;
  const durationSec = durationRaw ? Math.max(0, parseInt(durationRaw, 10) || 0) : null;
  const ringSec = ringRaw ? Math.max(0, parseInt(ringRaw, 10) || 0) : null;

  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: { id: true, leadId: true, userId: true, startedAt: true },
  });
  if (!call) redirect("/dialer");
  if (call.userId !== user.id && user.role !== "MANAGER") redirect("/dialer");

  // If the salesperson is logging a manual outcome (direct mode), apply call-status
  // side effects (Lead.autoLabel, lastContactedAt, nextRedialAt) once, here.
  if (outcome) {
    const statusForHandler =
      outcome === "CONNECTED" ? "completed" :
      outcome === "NO_ANSWER" ? "no-answer" :
      outcome === "BUSY" ? "busy" :
      "failed";
    await applyCallStatusUpdate({
      callId,
      status: statusForHandler,
      duration: durationSec ?? (outcome === "CONNECTED" ? 30 : 0),
    });
  }

  // Pin precise ring/talk timestamps so ring time is recoverable later:
  //   CONNECTED → answeredAt = dial + ring;  endedAt = answeredAt + talk
  //   not picked → endedAt = dial + ring (how long it rang), no answeredAt
  const callData: {
    feedbackNote: string | null;
    dispositionLabel: ManualLabel | null;
    answeredAt?: Date | null;
    endedAt?: Date;
    durationSec?: number;
  } = { feedbackNote: note, dispositionLabel: label };
  if (ringSec !== null) {
    const startMs = +call.startedAt;
    if (outcome === "CONNECTED") {
      const answered = new Date(startMs + ringSec * 1000);
      callData.answeredAt = answered;
      callData.endedAt = new Date(answered.getTime() + (durationSec ?? 0) * 1000);
      callData.durationSec = durationSec ?? 0;
    } else if (outcome) {
      callData.answeredAt = null;
      callData.endedAt = new Date(startMs + ringSec * 1000);
      callData.durationSec = 0;
    }
  }

  // These writes are independent of each other — run them together to cut latency
  // so the next lead loads fast.
  const writes: Promise<unknown>[] = [
    prisma.call.update({ where: { id: callId }, data: callData }),
  ];

  if (label) {
    writes.push(
      prisma.leadLabel.upsert({
        where: { leadId_label: { leadId: call.leadId, label } },
        update: { appliedBy: user.id, appliedAt: new Date() },
        create: { leadId: call.leadId, label, appliedBy: user.id },
      }),
    );
  }

  const hours = redialIn ? parseFloat(redialIn) : NaN;
  if (!Number.isNaN(hours) && hours > 0) {
    writes.push(
      prisma.lead.update({
        where: { id: call.leadId },
        data: {
          nextRedialAt: new Date(Date.now() + hours * 3600_000),
          autoLabel: "REDIAL",
        },
      }),
    );
  }

  await Promise.all(writes);

  revalidatePath("/dialer");
  revalidatePath(`/leads/${call.leadId}`);
  revalidatePath("/leads");
  redirect("/dialer");
}
