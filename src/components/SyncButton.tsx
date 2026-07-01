"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runSheetSyncNow } from "@/lib/leads/settings-actions";

const REASON_TEXT: Record<string, string> = {
  not_configured: "No sheet link saved yet — add one in Manager → Settings.",
  not_public: "A sheet isn't shared publicly — set it to “Anyone with the link → Viewer”.",
  columns_not_found: "Couldn't find name/phone columns in a sheet.",
  bad_url: "A saved sheet link looks invalid.",
  fetch_failed: "Couldn't reach Google Sheets — check your connection and try again.",
  forbidden: "Please sign in again to sync.",
};

/**
 * Sync-now button that works from anywhere it's placed. Calls the server action,
 * shows an inline spinner + result, and refreshes the current page so freshly
 * imported leads appear immediately.
 */
export function SyncButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  function onClick() {
    setMsg(null);
    startTransition(async () => {
      const r = await runSheetSyncNow();
      if (r.ok) {
        setMsg({
          ok: true,
          text: `Synced: ${r.created} new · ${r.duplicates} existing · ${r.labeled} labels · ${r.notes} notes.`,
        });
        router.refresh();
      } else {
        setMsg({ ok: false, text: REASON_TEXT[r.reason ?? "fetch_failed"] ?? `Sync failed: ${r.reason}` });
      }
    });
  }

  const base =
    className ??
    "rounded-lg ring-1 ring-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50 transition disabled:opacity-60";

  return (
    <div className={compact ? "inline-flex items-center gap-2" : "flex flex-col items-end gap-1"}>
      <button type="button" onClick={onClick} disabled={pending} className={base} aria-busy={pending}>
        {pending ? "Syncing…" : "Sync"}
      </button>
      {msg ? (
        <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-amber-700"} ${compact ? "" : "max-w-xs text-right"}`}>
          {msg.text}
        </span>
      ) : null}
    </div>
  );
}
