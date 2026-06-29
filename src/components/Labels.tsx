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
  INTERESTED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  NOT_INTERESTED: "bg-rose-50 text-rose-700 ring-rose-200",
  CALL_LATER: "bg-sky-50 text-sky-700 ring-sky-200",
  BUSY: "bg-amber-50 text-amber-700 ring-amber-200",
  CALL_CUT: "bg-orange-50 text-orange-700 ring-orange-200",
  WRONG_NUMBER: "bg-red-50 text-red-700 ring-red-200",
  BLOCKED: "bg-red-100 text-red-800 ring-red-300",
  OFFLINE: "bg-slate-100 text-slate-600 ring-slate-300",
  MALE: "bg-blue-50 text-blue-700 ring-blue-200",
  HINDI: "bg-teal-50 text-teal-700 ring-teal-200",
  OTHER_LANGUAGE: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  WHATSAPP_SHARED: "bg-green-50 text-green-700 ring-green-200",
};

const MANUAL_TEXT: Record<ManualLabel, string> = {
  DISPATCH: "Dispatch",
  BOOKED: "Booked",
  ORDERED: "Ordered",
  PAID: "Paid",
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not interested",
  CALL_LATER: "Call later",
  BUSY: "Busy",
  CALL_CUT: "Call cut",
  WRONG_NUMBER: "Wrong number",
  BLOCKED: "Blocked",
  OFFLINE: "Offline",
  MALE: "Male",
  HINDI: "Hindi",
  OTHER_LANGUAGE: "Other language",
  WHATSAPP_SHARED: "WhatsApp",
};

export const MANUAL_LABEL_TEXT = MANUAL_TEXT;

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
      {MANUAL_TEXT[label]}
    </span>
  );
}

export const MANUAL_LABELS: ManualLabel[] = [
  "INTERESTED", "NOT_INTERESTED", "CALL_LATER", "BUSY", "CALL_CUT",
  "WRONG_NUMBER", "BLOCKED", "OFFLINE", "MALE", "HINDI", "OTHER_LANGUAGE",
  "WHATSAPP_SHARED", "DISPATCH", "BOOKED", "ORDERED", "PAID",
];
