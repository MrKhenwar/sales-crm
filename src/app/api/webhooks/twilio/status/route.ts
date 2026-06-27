import { NextRequest, NextResponse } from "next/server";
import { applyCallStatusUpdate } from "@/lib/calls/handlers";
import { validateTwilioSignature } from "@/lib/telephony/twilio";

export const runtime = "nodejs";

/** Parent-call lifecycle from Twilio: initiated/ringing/answered/completed. */
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
  const status = String(form.get("CallStatus") ?? "").toLowerCase();
  const duration = Number(form.get("CallDuration") ?? "0") || undefined;

  if (callId && status) {
    await applyCallStatusUpdate({ callId, status, duration });
  }
  return new NextResponse("", { status: 204 });
}
