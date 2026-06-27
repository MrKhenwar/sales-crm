import { prisma } from "@/lib/prisma";
import type { InitiateCallInput, InitiateCallResult, TelephonyProvider } from "./types";
import { applyCallStatusUpdate } from "@/lib/calls/handlers";

/**
 * Mock telephony for local dev — simulates the lifecycle Twilio would drive via
 * webhooks by writing to the Call row on timers. No external connectivity required.
 */
export const mockProvider: TelephonyProvider = {
  name: "mock",
  async initiateCall(input: InitiateCallInput): Promise<InitiateCallResult> {
    const sid = `MOCK-${input.callId}`;
    await prisma.call.update({
      where: { id: input.callId },
      data: { providerCallSid: sid, provider: "mock" },
    });

    // Simulate ringing → answered → completed (or no-answer, randomly)
    const scenario = Math.random();
    const ringInMs = 800 + Math.random() * 1200;

    // Use process.nextTick + setTimeout to defer past the action's response
    setTimeout(async () => {
      try { await applyCallStatusUpdate({ callId: input.callId, status: "ringing" }); } catch {}
    }, ringInMs);

    if (scenario < 0.7) {
      // Connected then completed
      setTimeout(async () => {
        try { await applyCallStatusUpdate({ callId: input.callId, status: "in-progress" }); } catch {}
      }, ringInMs + 1500);
      const dur = 6 + Math.floor(Math.random() * 20);
      setTimeout(async () => {
        try {
          await applyCallStatusUpdate({
            callId: input.callId,
            status: "completed",
            duration: dur,
            recordingUrl: `https://example.invalid/mock-recording/${input.callId}.mp3`,
          });
        } catch {}
      }, ringInMs + 1500 + dur * 100); // shrink time so dev tests don't drag
    } else if (scenario < 0.9) {
      setTimeout(async () => {
        try { await applyCallStatusUpdate({ callId: input.callId, status: "no-answer" }); } catch {}
      }, ringInMs + 4000);
    } else {
      setTimeout(async () => {
        try { await applyCallStatusUpdate({ callId: input.callId, status: "busy" }); } catch {}
      }, ringInMs + 2000);
    }

    return { provider: "mock", providerCallSid: sid };
  },
};
