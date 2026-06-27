import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Polling endpoint the dialer page hits every couple of seconds while a call is in flight.
 * Returns the current state of an active call so the UI can flip to the feedback modal
 * the moment the provider reports the call ended.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const callId = url.searchParams.get("callId");
  if (!callId) return NextResponse.json({ call: null });

  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: {
      id: true,
      outcome: true,
      startedAt: true,
      answeredAt: true,
      endedAt: true,
      durationSec: true,
      recordingUrl: true,
      feedbackNote: true,
      lead: { select: { id: true, name: true, phone: true } },
    },
  });

  if (!call) return NextResponse.json({ call: null });
  return NextResponse.json({
    call: {
      ...call,
      startedAt: call.startedAt?.toISOString() ?? null,
      answeredAt: call.answeredAt?.toISOString() ?? null,
      endedAt: call.endedAt?.toISOString() ?? null,
    },
  });
}
