"use client";

import { useState } from "react";

let uid = 0;
const newRow = (value = "") => ({ key: `sheet-${uid++}`, value });

/**
 * One input row per Google Sheet link, with an "Add another sheet" button so the
 * manager can paste as many sheets as they want. All rows share the name
 * `googleSheetUrl`, so the server action reads them with formData.getAll().
 */
export function SheetUrlsField({ initial }: { initial: string[] }) {
  const [rows, setRows] = useState(() =>
    (initial.length ? initial : [""]).map((v) => newRow(v)),
  );

  const update = (key: string, value: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, value } : r)));
  const remove = (key: string) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [newRow()]));
  const add = () => setRows((rs) => [...rs, newRow()]);

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={row.key} className="flex items-center gap-2">
          <input
            name="googleSheetUrl"
            value={row.value}
            onChange={(e) => update(row.key, e.target.value)}
            placeholder={`https://docs.google.com/spreadsheets/d/…/edit?gid=…  (sheet ${i + 1})`}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none font-mono"
          />
          <button
            type="button"
            onClick={() => remove(row.key)}
            aria-label="Remove sheet"
            className="shrink-0 rounded-lg ring-1 ring-slate-300 text-slate-500 hover:bg-slate-50 hover:text-red-600 w-9 h-9 flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-lg ring-1 ring-slate-300 text-slate-700 text-sm font-medium px-3 py-1.5 hover:bg-slate-50 transition"
      >
        + Add another sheet
      </button>
    </div>
  );
}
