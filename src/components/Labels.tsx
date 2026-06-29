import type { AutoLabel, ManualLabel } from "@/generated/prisma/enums";

const AUTO_STYLE: Record<AutoLabel, string> = {
  NONE: "bg-slate-100 text-slate-600 ring-slate-200",
  NOT_PICKED: "bg-amber-50 text-amber-700 ring-amber-200",
  CONNECTED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  REDIAL: "bg-sky-50 text-sky-700 ring-sky-200",
};

const MANUAL_STYLE: Record<ManualLabel, string> = {
  DISPATCH: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  BOOKED: "bg-violet-50 text-violet-700 ring-violet-200",
  ORDERED: "bg-pink-50 text-pink-700 ring-pink-200",
  PAID: "bg-emerald-100 text-emerald-800 ring-emerald-300",
};

const AUTO_TEXT: Record<AutoLabel, string> = {
  NONE: "",
  NOT_PICKED: "Not picked",
  CONNECTED: "Picked",
  REDIAL: "Redial",
};

export function AutoLabelChip({ label }: { label: AutoLabel }) {
  if (label === "NONE") return null;
  return (
    <span className={`inline-flex items-center rounded-full text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 ring-1 ${AUTO_STYLE[label]}`}>
      {AUTO_TEXT[label]}
    </span>
  );
}

export const AUTO_LABEL_TEXT = AUTO_TEXT;

export function ManualLabelChip({ label }: { label: ManualLabel }) {
  return (
    <span className={`inline-flex items-center rounded-full text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 ring-1 ${MANUAL_STYLE[label]}`}>
      {label}
    </span>
  );
}

export const MANUAL_LABELS: ManualLabel[] = ["DISPATCH", "BOOKED", "ORDERED", "PAID"];
