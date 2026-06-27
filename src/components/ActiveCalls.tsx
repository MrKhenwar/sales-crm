"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type ActiveCall = {
  id: string;
  startedAtMs: number;
  agentName: string;
  leadName: string;
  leadId: string;
  phone: string;
};

function fmt(s: number): string {
  if (s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Polls the server every 4 seconds for the up-to-date list of active calls,
 * and ticks each row's timer locally every second so the duration stays smooth.
 */
export function ActiveCalls({
  initial,
  fetchUrl,
}: {
  initial: ActiveCall[];
  fetchUrl: string;
}) {
  const [calls, setCalls] = useState<ActiveCall[]>(initial);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch(fetchUrl, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { calls: ActiveCall[] };
        setCalls(data.calls ?? []);
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(poll);
  }, [fetchUrl]);

  if (calls.length === 0) {
    return (
      <div className="text-sm text-slate-500 italic">
        No calls in progress.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {calls.map((c) => {
        const seconds = Math.max(0, Math.floor((now - c.startedAtMs) / 1000));
        const long = seconds > 120; // pulse if call > 2 min
        return (
          <li key={c.id} className="py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm">
                <span className="font-medium">{c.agentName}</span>
                <span className="text-slate-400 mx-1.5">→</span>
                <Link href={`/leads/${c.leadId}`} prefetch className="text-slate-900 hover:underline">
                  {c.leadName}
                </Link>
              </div>
              <div className="text-xs text-slate-500 font-mono">{c.phone}</div>
            </div>
            <div className={`tabular-nums text-sm font-mono font-semibold ${long ? "text-amber-600" : "text-emerald-700"}`}>
              <span className="inline-block w-2 h-2 rounded-full bg-current mr-1.5 animate-pulse" />
              {fmt(seconds)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
