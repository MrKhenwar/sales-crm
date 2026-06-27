import { NextRequest, NextResponse } from "next/server";
import { verifyMetaSignature, fetchMetaLead, metaFieldsToIngest } from "@/lib/integrations/meta";
import { ingestLead } from "@/lib/leads/ingest";

export const runtime = "nodejs";

/** Meta webhook subscription verification. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.META_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

type LeadgenChange = {
  field?: string;
  value?: { leadgen_id?: string; page_id?: string; form_id?: string; created_time?: number; ad_id?: string };
};
type LeadgenEntry = { id?: string; time?: number; changes?: LeadgenChange[] };
type LeadgenBody = { object?: string; entry?: LeadgenEntry[] };

/** Meta posts leadgen events here. We dedupe by phone in ingestLead. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  const appSecret = process.env.META_APP_SECRET;
  const devBypass = process.env.META_DEV_MODE === "true";
  if (!devBypass) {
    if (!appSecret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    if (!verifyMetaSignature(rawBody, signature, appSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let body: LeadgenBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.object !== "page") return NextResponse.json({ ok: true, ignored: true });

  const results: Array<{ leadgenId: string; status: string }> = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const leadgenId = change.value?.leadgen_id;
      if (!leadgenId) continue;
      try {
        const field_data = await fetchMetaLead(leadgenId);
        const partial = metaFieldsToIngest(field_data, undefined);
        if (!partial) {
          results.push({ leadgenId, status: "skipped:no_name_or_phone" });
          continue;
        }
        const r = await ingestLead({ ...partial, source: "META" });
        results.push({ leadgenId, status: r.status });
      } catch (e) {
        results.push({ leadgenId, status: `error:${(e as Error).message.slice(0, 80)}` });
      }
    }
  }

  // ACK fast — Meta retries on non-2xx.
  return NextResponse.json({ ok: true, results });
}
