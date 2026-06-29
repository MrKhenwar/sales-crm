"use client";

import { useOptimistic, useTransition } from "react";
import { MANUAL_LABEL_TEXT } from "@/components/Labels";
import type { ManualLabel } from "@/generated/prisma/enums";

/**
 * Manual-label toggles with optimistic UI: the chip flips state the instant you
 * tap it, while the server action runs in the background. No full-page reload,
 * so there's no "buffering" between click and visual feedback.
 */
export function LabelToggles({
  leadId,
  labels,
  applied,
  applyAction,
  removeAction,
}: {
  leadId: string;
  labels: ManualLabel[];
  applied: ManualLabel[];
  applyAction: (formData: FormData) => void | Promise<void>;
  removeAction: (formData: FormData) => void | Promise<void>;
}) {
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(
    new Set(applied),
    (current: Set<ManualLabel>, label: ManualLabel) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    },
  );

  function toggle(label: ManualLabel, isOn: boolean) {
    startTransition(async () => {
      setOptimistic(label);
      const fd = new FormData();
      fd.set("leadId", leadId);
      fd.set("label", label);
      await (isOn ? removeAction(fd) : applyAction(fd));
    });
  }

  return (
    <div className="mt-4 flex gap-2 flex-wrap">
      {labels.map((label) => {
        const isOn = optimistic.has(label);
        return (
          <button
            key={label}
            type="button"
            onClick={() => toggle(label, isOn)}
            aria-pressed={isOn}
            className={
              isOn
                ? "rounded-full text-xs font-semibold px-3 py-1 bg-slate-900 text-white transition"
                : "rounded-full text-xs font-semibold px-3 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
            }
          >
            {MANUAL_LABEL_TEXT[label]}
          </button>
        );
      })}
    </div>
  );
}
