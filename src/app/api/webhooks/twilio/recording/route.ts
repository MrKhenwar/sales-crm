import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTwilioSignature } from "@/lib/telephony/twilio";

export const runtime = "nodejs";

/** Twilio posts here when a recording is ready. */
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
  const recordingUrl = String(form.get("RecordingUrl") ?? "");
  const status = String(form.get("RecordingStatus") ?? "").toLowerCase();

  if (callId && recordingUrl && status === "completed") {
    await prisma.call.update({
      where: { id: callId },
      data: { recordingUrl: `${recordingUrl}.mp3` },
    }).catch(() => {});
  }
  return new NextResponse("", { status: 204 });
}
