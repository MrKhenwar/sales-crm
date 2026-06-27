"use client";

import { useEffect, useRef, useState } from "react";

type Lead = { id: string; name: string; phone: string };

export function DirectCallPanel({
  callId,
  lead,
  submitFeedbackAction,
}: {
  callId: string;
  lead: Lead;
  submitFeedbackAction: (formData: FormData) => void | Promise<void>;
}) {
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef(Date.now());
  const telHref = `tel:${lead.phone.replace(/\s+/g, "")}`;

  // Auto-open the phone's native dialer once on mount (best-effort).
  useEffect(() => {
    const t = setTimeout(() => {
      try { window.location.href = telHref; } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [telHref]);

  // Live elapsed-seconds counter — pre-fills the duration field.
  useEffect(() => {
    startRef.current = Date.now();
    const i = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(i);
  }, []);

  const labels = ["DISPATCH", "BOOKED", "ORDERED", "PAID"] as const;

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl ring-1 ring-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-emerald-700">Calling now</div>
            <div className="font-semibold mt-1">{lead.name}</div>
            <div className="text-xs text-emerald-700 tabular-nums">{lead.phone}</div>
          </div>
          <a
            href={telHref}
            className="rounded-lg bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700"
          >
            Open dialer
          </a>
        </div>
        <p className="text-xs text-emerald-800 mt-3">
          On your phone this opens the native dialer. On a laptop it'll open your default call app
          (FaceTime / Skype). Make the call, then fill in the outcome below.
        </p>
      </div>

      <form action={submitFeedbackAction} className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 space-y-5">
        <input type="hidden" name="callId" value={callId} />

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Call outcome</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["CONNECTED", "NO_ANSWER", "BUSY", "FAILED"] as const).map((o) => (
              <label key={o} className={`rounded-lg ring-1 ring-slate-200 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 flex items-center gap-2`}>
                <input type="radio" name="outcome" value={o} required defaultChecked={o === "CONNECTED"} />
                <span>{o.replace("_", " ")}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Duration (seconds)</span>
            <input
              name="durationSec"
              type="number"
              min="0"
              defaultValue={seconds}
              key={seconds}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
            <span className="text-xs text-slate-400 mt-1 block">Live timer · pre-filled from the moment you clicked Call</span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Redial in (hours)</span>
            <input
              name="redialIn"
              type="number"
              min="0"
              step="0.5"
              placeholder="optional"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </label>
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

        <div className="flex justify-end gap-2 pt-2">
          <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2">
            Save & next
          </button>
        </div>
      </form>
    </div>
  );
}
