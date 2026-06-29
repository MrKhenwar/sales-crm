"use client";

import { startCallForLead } from "@/lib/calls/actions";

/**
 * Call action that actually dials on a phone.
 *
 * On tap we set window.location to a `tel:` URL — this happens inside a real
 * user gesture, so the Android WebView fires the native dialer (an auto-redirect
 * on page load would be blocked). The form still POSTs `startCallForLead`, which
 * records the call and routes to the dialer where ring/talk time is logged.
 */
export function CallButton({
  leadId,
  phone,
  sessionId,
  compact = false,
  fullWidth = false,
}: {
  leadId: string;
  phone: string;
  sessionId?: string;
  compact?: boolean;
  fullWidth?: boolean;
}) {
  const tel = `tel:${phone.replace(/[^\d+]/g, "")}`;
  const cls = compact
    ? "rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium px-2 py-1 ring-1 ring-emerald-200 hover:bg-emerald-100 transition"
    : `${fullWidth ? "w-full" : ""} inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white text-sm font-medium px-3 py-2.5 hover:bg-emerald-700 transition`;

  return (
    <form
      action={startCallForLead}
      className={fullWidth && !compact ? "contents" : undefined}
      onSubmit={() => {
        try { window.location.href = tel; } catch { /* ignore */ }
      }}
    >
      <input type="hidden" name="leadId" value={leadId} />
      {sessionId ? <input type="hidden" name="sessionId" value={sessionId} /> : null}
      <button type="submit" className={cls}>
        {compact ? "Call" : (
          <>
            <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.24 1.02l-2.2 2.2Z" />
            </svg>
            Call
          </>
        )}
      </button>
    </form>
  );
}
