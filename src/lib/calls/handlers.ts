import { prisma } from "@/lib/prisma";
import { statusToOutcome } from "@/lib/telephony/types";

export type StatusUpdate = {
  callId: string;
  status: string;
  duration?: number;
  recordingUrl?: string;
};

/**
 * Apply a status event (from Twilio webhook or mock timer) to the Call row.
 * Derives autoLabel on the Lead: NO_ANSWER/BUSY/FAILED → NOT_PICKED + schedule REDIAL.
 * Marks CONNECTED on the parent Lead when the call completes with non-zero duration.
 */
export async function applyCallStatusUpdate(ev: StatusUpdate): Promise<void> {
  const call = await prisma.call.findUnique({
    where: { id: ev.callId },
    select: { id: true, leadId: true, startedAt: true, answeredAt: true, endedAt: true, outcome: true },
  });
  if (!call) return;

  const outcome = statusToOutcome(ev.status);
  const now = new Date();

  const data: {
    answeredAt?: Date;
    endedAt?: Date;
    durationSec?: number | null;
    recordingUrl?: string | null;
    outcome?: ReturnType<typeof statusToOutcome> extends infer T ? Exclude<T, null> : never;
  } = {};

  if (ev.status === "ringing") {
    // no-op for now; we could note ringing
  }
  if (ev.status === "in-progress" && !call.answeredAt) {
    data.answeredAt = now;
  }
  if (ev.status === "completed" || ev.status === "no-answer" || ev.status === "busy" || ev.status === "failed" || ev.status === "canceled") {
    if (!call.endedAt) data.endedAt = now;
    if (ev.duration !== undefined) data.durationSec = ev.duration;
    if (ev.recordingUrl) data.recordingUrl = ev.recordingUrl;
  }
  if (outcome) data.outcome = outcome;

  if (Object.keys(data).length > 0) {
    await prisma.call.update({ where: { id: ev.callId }, data });
  }

  // Derive Lead.autoLabel + lastContactedAt + nextRedialAt
  const wasNotPicked = ev.status === "no-answer" || ev.status === "busy" || ev.status === "failed" || ev.status === "canceled";
  const wasConnected = ev.status === "completed" && (ev.duration ?? 0) >= 3;

  if (wasNotPicked) {
    await prisma.lead.update({
      where: { id: call.leadId },
      data: {
        autoLabel: "NOT_PICKED",
        lastContactedAt: now,
        nextRedialAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // +2h
      },
    });
  } else if (wasConnected) {
    await prisma.lead.update({
      where: { id: call.leadId },
      data: {
        autoLabel: "CONNECTED",
        lastContactedAt: now,
        nextRedialAt: null,
      },
    });
  } else if (ev.status === "completed") {
    // Completed but very short — treat as not-really-connected, mark NOT_PICKED softer (no redial)
    await prisma.lead.update({
      where: { id: call.leadId },
      data: { lastContactedAt: now },
    });
  }
}
