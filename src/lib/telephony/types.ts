import type { CallOutcome } from "@/generated/prisma/enums";

export type InitiateCallInput = {
  /** Internal Call.id — the SID Twilio sends back will be stored alongside this. */
  callId: string;
  /** E.164 number of the salesperson (Twilio rings this first). */
  agentPhone: string;
  /** E.164 number of the lead (bridged when agent answers). */
  leadPhone: string;
  /** Public origin used to build webhook callback URLs (no trailing slash). */
  publicBaseUrl: string;
};

export type InitiateCallResult = {
  provider: "twilio" | "mock";
  providerCallSid: string;
};

export type TwilioStatusEvent = {
  /** Internal Call.id from query string. */
  callId: string;
  /** Twilio parent CallSid. */
  callSid: string;
  status: "queued" | "initiated" | "ringing" | "in-progress" | "completed" | "busy" | "failed" | "no-answer" | "canceled";
  duration?: number;
  recordingUrl?: string;
};

export interface TelephonyProvider {
  name: "twilio" | "mock";
  initiateCall(input: InitiateCallInput): Promise<InitiateCallResult>;
}

/** Map Twilio's call status string to our CallOutcome enum. */
export function statusToOutcome(s: string): CallOutcome | null {
  switch (s) {
    case "completed":
    case "in-progress":
      return "CONNECTED";
    case "no-answer":
    case "canceled":
      return "NO_ANSWER";
    case "busy":
      return "BUSY";
    case "failed":
      return "FAILED";
    default:
      return null;
  }
}
