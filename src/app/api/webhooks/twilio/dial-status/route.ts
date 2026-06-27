import { NextRequest, NextResponse } from "next/server";
import { applyCallStatusUpdate } from "@/lib/calls/handlers";
import { validateTwilioSignature } from "@/lib/telephony/twilio";

export const runtime = "nodejs";

/**
 * Twilio posts the outcome of the <Dial> here when the lead leg ends.
 * DialCallStatus = completed | busy | no-answer | failed | canceled
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const url = `${req.nextUrl.protocol}//${req.nextUrl.host}${req.nextUrl.pathname}${req.nextUrl.search}`;
  const devBypass = process.env.TWILIO_DEV_MODE === "true";
  if (!devBypass) {
    const sig = req.headers.get("x-twilio-signature");
    if (!validateTwilioSignature(url, params, sig)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  const callId = req.nextUrl.searchParams.get("callId") ?? "";
  const dialStatus = String(form.get("DialCallStatus") ?? "").toLowerCase();
  const duration = Number(form.get("DialCallDuration") ?? "0") || undefined;

  if (callId && dialStatus) {
    await applyCallStatusUpdate({ callId, status: dialStatus, duration });
  }

  // Hang up after the dial action — no further TwiML needed.
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`,
    { status: 200, headers: { "Content-Type": "text/xml" } }
  );
}
