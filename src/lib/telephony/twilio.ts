import twilio from "twilio";
import type { InitiateCallInput, InitiateCallResult, TelephonyProvider } from "./types";

let client: ReturnType<typeof twilio> | null = null;
function getClient() {
  if (client) return client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio credentials missing (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  client = twilio(sid, token);
  return client;
}

export const twilioProvider: TelephonyProvider = {
  name: "twilio",
  async initiateCall(input: InitiateCallInput): Promise<InitiateCallResult> {
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!from) throw new Error("TWILIO_FROM_NUMBER not configured");

    const c = getClient();
    const callbackBase = `${input.publicBaseUrl}/api/webhooks/twilio`;
    const qs = `callId=${encodeURIComponent(input.callId)}&leadPhone=${encodeURIComponent(input.leadPhone)}`;

    // Two-leg pattern: Twilio rings the agent first; once they answer it
    // fetches our TwiML which <Dial>s the lead, with recording enabled.
    const call = await c.calls.create({
      to: input.agentPhone,
      from,
      url: `${callbackBase}/voice?${qs}`,
      method: "POST",
      statusCallback: `${callbackBase}/status?${qs}`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
      record: false, // recording happens on the bridged <Dial> leg
    });

    return { provider: "twilio", providerCallSid: call.sid };
  },
};

/** Verify Twilio's X-Twilio-Signature on incoming webhooks. */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null
): boolean {
  if (!signature) return false;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  return twilio.validateRequest(token, signature, url, params);
}
