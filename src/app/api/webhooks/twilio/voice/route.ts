import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Twilio fetches this URL when the agent leg is answered.
 * We respond with TwiML that <Dial>s the lead, captures recording,
 * and points the dial-status callback back at us.
 */
export async function POST(req: NextRequest) {
  const url = req.nextUrl;
  const callId = url.searchParams.get("callId") ?? "";
  const leadPhone = url.searchParams.get("leadPhone") ?? "";

  // Best-effort: capture the agent-leg CallSid for our record.
  try {
    const form = await req.formData();
    const sid = String(form.get("CallSid") ?? "");
    if (sid && callId) {
      await prisma.call.update({
        where: { id: callId },
        data: { providerCallSid: sid, provider: "twilio", answeredAt: new Date() },
      }).catch(() => {});
    }
  } catch { /* ignore */ }

  const base = `${url.protocol}//${url.host}/api/webhooks/twilio`;
  const qs = `callId=${encodeURIComponent(callId)}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial action="${base}/dial-status?${qs}" method="POST"
        record="record-from-answer-dual" recordingStatusCallback="${base}/recording?${qs}"
        recordingStatusCallbackMethod="POST" timeout="25">
    <Number>${escapeXml(leadPhone)}</Number>
  </Dial>
</Response>`;
  return new NextResponse(twiml, { status: 200, headers: { "Content-Type": "text/xml" } });
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}
