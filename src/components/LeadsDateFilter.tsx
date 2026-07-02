"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const PRESETS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
];

/**
 * Date-wise filter for the leads views: quick preset chips plus a custom
 * From/To range. Presets and custom range are mutually exclusive — choosing one
 * clears the other. All other query params (view, search, labels…) are preserved.
 */
export function LeadsDateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const activeRange = params.get("range");
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const hasCustom = !!from || !!to;

  function push(next: URLSearchParams) {
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function selectPreset(key: string) {
    const next = new URLSearchParams(params.toString());
    next.delete("from");
    next.delete("to");
    if (activeRange === key) next.delete("range");
    else next.set("range", key);
    push(next);
  }

  function setCustom(field: "from" | "to", value: string) {
    const next = new URLSearchParams(params.toString());
    next.delete("range");
    if (value) next.set(field, value);
    else next.delete(field);
    push(next);
  }

  function clearAll() {
    const next = new URLSearchParams(params.toString());
    next.delete("range");
    next.delete("from");
    next.delete("to");
    push(next);
  }

  const anyActive = !!activeRange || hasCustom;

  return (
    <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 mr-1">Date</span>
        <button
          type="button"
          onClick={clearAll}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
            !anyActive ? "bg-slate-900 text-white" : "ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          All time
        </button>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => selectPreset(p.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              activeRange === p.key ? "bg-slate-900 text-white" : "ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
        <label className="text-xs text-slate-500">
          <span className="block mb-1">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setCustom("from", e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-slate-500">
          <span className="block mb-1">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setCustom("to", e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        {hasCustom ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-sm text-slate-500 hover:text-slate-800 px-2 py-1.5"
          >
            Clear
          </button>
        ) : null}
      </div>
    </section>
  );
}
