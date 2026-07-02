"use client";

import { useState, useTransition } from "react";
import { AUTO_LABEL_TEXT, MANUAL_LABEL_TEXT } from "@/components/Labels";
import type { AutoLabel, ManualLabel } from "@/generated/prisma/enums";

type Person = { id: string; name: string };

const AUTO_OPTIONS: AutoLabel[] = ["NOT_PICKED", "CONNECTED", "REDIAL"];
const MANUAL_OPTIONS: ManualLabel[] = [
  "BLOCKED", "NOT_INTERESTED", "BUSY", "CALL_CUT", "WRONG_NUMBER", "OFFLINE",
  "CALL_LATER", "INTERESTED", "MALE", "HINDI", "OTHER_LANGUAGE", "WHATSAPP_SHARED",
  "DISPATCH", "BOOKED", "ORDERED", "PAID",
];

export function ManagerAssignBar({
  salespeople,
  unassignedCount,
  isAdmin,
  assignAllAction,
  reassignByLabelAction,
  reassignFromUserAction,
}: {
  salespeople: Person[];
  unassignedCount: number;
  // The unassigned pool belongs to no team, so only the admin can distribute it.
  isAdmin: boolean;
  assignAllAction: () => void | Promise<void>;
  reassignByLabelAction: (formData: FormData) => void | Promise<void>;
  reassignFromUserAction: (formData: FormData) => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-medium">Distribute leads</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAdmin
              ? unassignedCount > 0
                ? `${unassignedCount} unassigned lead${unassignedCount === 1 ? "" : "s"} waiting. `
                : "All leads are assigned. "
              : ""}
            Split fairly across the team or hand labeled leads to someone else.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <form action={() => startTransition(() => assignAllAction())}>
              <button
                type="submit"
                disabled={pending || unassignedCount === 0}
                className="rounded-lg bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Working…" : `Assign all unassigned (${unassignedCount})`}
              </button>
            </form>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg ring-1 ring-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50"
          >
            {open ? "Hide" : "More…"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2 border-t border-slate-100 pt-4">
          {/* Move labeled leads to one salesperson */}
          <form
            action={(fd) => startTransition(() => reassignByLabelAction(fd))}
            className="rounded-xl ring-1 ring-slate-200 p-3 space-y-2"
          >
            <div className="text-sm font-medium text-slate-700">Move labeled leads</div>
            <p className="text-xs text-slate-500">
              Hand every lead with a label (e.g. Not picked, Blocked) to one salesperson.
            </p>
            <select name="label" required defaultValue="" className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
              <option value="" disabled>Choose a label…</option>
              <optgroup label="Call state">
                {AUTO_OPTIONS.map((l) => (
                  <option key={l} value={`auto:${l}`}>{AUTO_LABEL_TEXT[l]}</option>
                ))}
              </optgroup>
              <optgroup label="Manual labels">
                {MANUAL_OPTIONS.map((l) => (
                  <option key={l} value={`manual:${l}`}>{MANUAL_LABEL_TEXT[l]}</option>
                ))}
              </optgroup>
            </select>
            <select name="toUserId" required defaultValue="" className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
              <option value="" disabled>Move to…</option>
              {salespeople.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? "Working…" : "Move labeled leads"}
            </button>
          </form>

          {/* Reassign an idle salesperson's leads */}
          <form
            action={(fd) => startTransition(() => reassignFromUserAction(fd))}
            className="rounded-xl ring-1 ring-slate-200 p-3 space-y-2"
          >
            <div className="text-sm font-medium text-slate-700">Reassign an idle salesperson</div>
            <p className="text-xs text-slate-500">
              Not calling their leads? Move them to someone else, or leave the target blank to re-spread fairly.
            </p>
            <select name="fromUserId" required defaultValue="" className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
              <option value="" disabled>Take leads from…</option>
              {salespeople.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select name="toUserId" defaultValue="" className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
              <option value="">Re-spread across everyone else</option>
              {salespeople.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" name="mode" value="uncontacted" defaultChecked />
              Only leads they never contacted
            </label>
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg ring-1 ring-slate-300 text-slate-800 text-sm font-medium px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
            >
              {pending ? "Working…" : "Reassign leads"}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
