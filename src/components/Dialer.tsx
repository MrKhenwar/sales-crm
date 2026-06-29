"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";

type Lead = { id: string; name: string; phone: string };
type CallSnapshot = {
  id: string;
  outcome: "PENDING" | "CONNECTED" | "NO_ANSWER" | "BUSY" | "FAILED";
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  recordingUrl: string | null;
  feedbackNote: string | null;
  lead: Lead;
};

export function DialerLive({
  activeCallId,
  initialCall,
  submitFeedbackAction,
}: {
  activeCallId: string | null;
  initialCall: CallSnapshot | null;
  submitFeedbackAction: (formData: FormData) => void | Promise<void>;
}) {
  const [call, setCall] = useState<CallSnapshot | null>(initialCall);
  const [modalOpen, setModalOpen] = useState(false);
  const lastIdRef = useRef<string | null>(initialCall?.id ?? null);
  const router = useRouter();

  useEffect(() => {
    if (!activeCallId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/calls/active?callId=${activeCallId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { call: CallSnapshot | null };
        if (data.call) {
          setCall(data.call);
          if (data.call.endedAt && !data.call.feedbackNote) {
            setModalOpen(true);
            clearInterval(interval);
          }
        }
      } catch { /* ignore polling errors */ }
    }, 1500);
    return () => clearInterval(interval);
  }, [activeCallId]);

  useEffect(() => {
    if (call?.id && call.id !== lastIdRef.current) {
      lastIdRef.current = call.id;
      setModalOpen(false);
    }
  }, [call?.id]);

  if (!activeCallId || !call) return null;

  const status = call.endedAt
    ? `${call.outcome.toLowerCase()} · ${call.durationSec ?? 0}s`
    : call.answeredAt
    ? "connected"
    : "ringing…";

  return (
    <>
      <div className="rounded-2xl ring-1 ring-slate-200 bg-white p-5 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wide">In progress</div>
            <div className="font-semibold mt-1">{call.lead.name}</div>
            <div className="text-xs text-slate-500 tabular-nums">{call.lead.phone}</div>
          </div>
          <div className={`text-sm px-3 py-1 rounded-full ${
            call.endedAt ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
          }`}>{status}</div>
        </div>
      </div>

      {modalOpen ? (
        <FeedbackModal
          call={call}
          onClose={() => { setModalOpen(false); router.refresh(); }}
          submitFeedbackAction={submitFeedbackAction}
        />
      ) : null}
    </>
  );
}

function FeedbackModal({
  call,
  onClose,
  submitFeedbackAction,
}: {
  call: CallSnapshot;
  onClose: () => void;
  submitFeedbackAction: (formData: FormData) => void | Promise<void>;
}) {
  const labels = ["DISPATCH", "BOOKED", "ORDERED", "PAID"] as const;

  return (
    <div className="fixed inset-0 z-30 bg-slate-900/40 grid place-items-center px-4">
      <form
        action={submitFeedbackAction}
        className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6 space-y-5"
      >
        <input type="hidden" name="callId" value={call.id} />
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Call ended</div>
          <h2 className="text-lg font-semibold mt-1">Log feedback for {call.lead.name}</h2>
          <div className="text-xs text-slate-500 mt-0.5">
            Outcome: <span className="font-medium text-slate-700">{call.outcome}</span>
            {call.durationSec != null ? <> · {call.durationSec}s</> : null}
            {call.recordingUrl ? <> · <a className="underline" href={call.recordingUrl} target="_blank" rel="noreferrer">recording</a></> : null}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Note</span>
          <textarea
            name="note"
            rows={3}
            placeholder="What happened on the call?"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Apply label (optional)</legend>
          <div className="mt-2 flex gap-2 flex-wrap">
            <label className="text-xs">
              <input type="radio" name="label" value="" defaultChecked className="mr-1" />
              None
            </label>
            {labels.map((l) => (
              <label key={l} className="text-xs">
                <input type="radio" name="label" value={l} className="mr-1" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Redial in (hours)</span>
          <input
            name="redialIn"
            type="number"
            min="0"
            step="0.5"
            placeholder="e.g. 4"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800 px-3 py-2">
            Skip
          </button>
          <SubmitButton pendingLabel="Saving…" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2">
            Save &amp; next
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
