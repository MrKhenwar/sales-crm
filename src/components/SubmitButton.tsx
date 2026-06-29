"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that immediately reflects the in-flight server action: it
 * disables itself and swaps to `pendingLabel` the moment it's tapped, so there's
 * visible feedback during the round-trip instead of a frozen-feeling button.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  onClick,
}: {
  children: React.ReactNode;
  pendingLabel?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={onClick}
      className={`${className ?? ""} disabled:opacity-60 disabled:cursor-wait`}
    >
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
