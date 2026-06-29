"use client";

import { useEffect, useRef, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";

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
  // phase: "ringing" until the lead picks up; "talking" after.
  const [phase, setPhase] = useState<"ringing" | "talking">("ringing");
  const [elapsed, setElapsed] = useState(0); // seconds since dial
  const [ringSec, setRingSec] = useState(0); // captured when "Picked up" is tapped
  const startRef = useRef(0);
  const telHref = `tel:${lead.phone.replace(/[^\d+]/g, "")}`;

  // Live elapsed-seconds counter since the call was started.
  useEffect(() => {
    startRef.current = Date.now();
    const i = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(i);
  }, []);

  const talkSec = phase === "talking" ? Math.max(0, elapsed - ringSec) : 0;
  const labels = ["DISPATCH", "BOOKED", "ORDERED", "PAID"] as const;

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl ring-1 ring-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-emerald-700">
              {phase === "ringing" ? "Ringing…" : "On the call"}
            </div>
            <div className="font-semibold mt-1">{lead.name}</div>
            <div className="text-xs text-emerald-700 tabular-nums">{lead.phone}</div>
          </div>
          <a
            href={telHref}
            className="rounded-lg bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700 shrink-0"
          >
            Open dialer
          </a>
        </div>

        <div className="mt-4 flex items-center gap-4">
          {phase === "ringing" ? (
            <>
              <div className="text-2xl font-semibold tabular-nums text-emerald-800">{fmt(elapsed)}</div>
              <button
                type="button"
                onClick={() => { setRingSec(elapsed); setPhase("talking"); startRef.current = Date.now() - elapsed * 1000; }}
                className="rounded-lg bg-emerald-700 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-800"
              >
                ✓ They picked up
              </button>
              <span className="text-xs text-emerald-800">Tap when the lead answers — we record how long it rang.</span>
            </>
          ) : (
            <div className="text-sm text-emerald-900">
              Rang <span className="font-semibold tabular-nums">{fmt(ringSec)}</span>
              <span className="mx-2 text-emerald-400">·</span>
              Talking <span className="font-semibold tabular-nums">{fmt(talkSec)}</span>
            </div>
          )}
        </div>
      </div>

      <form action={submitFeedbackAction} className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 space-y-5">
        <input type="hidden" name="callId" value={callId} />
        {/* ring = time before pick-up (or total ring if never answered); talk = time after pick-up */}
        <input type="hidden" name="ringSec" value={phase === "talking" ? ringSec : elapsed} />

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Call outcome</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["CONNECTED", "NO_ANSWER", "BUSY", "FAILED"] as const).map((o) => (
              <label key={o} className={`rounded-lg ring-1 ring-slate-200 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 flex items-center gap-2`}>
                <input type="radio" name="outcome" value={o} required defaultChecked={phase === "talking" ? o === "CONNECTED" : o === "NO_ANSWER"} />
                <span>{o.replace("_", " ")}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Talk time (seconds)</span>
            <input
              name="durationSec"
              type="number"
              min="0"
              defaultValue={talkSec}
              key={talkSec}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
            <span className="text-xs text-slate-400 mt-1 block">Live timer · counts from when they picked up</span>
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
          <SubmitButton pendingLabel="Saving…" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2">
            Save &amp; next
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
