import type { TelephonyProvider } from "./types";
import { twilioProvider } from "./twilio";
import { mockProvider } from "./mock";

export function getTelephonyProvider(): TelephonyProvider {
  const mode = (process.env.TELEPHONY_PROVIDER ?? "mock").toLowerCase();
  if (mode === "twilio") return twilioProvider;
  return mockProvider;
}

export * from "./types";
