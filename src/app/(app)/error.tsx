"use client";

import { useEffect } from "react";

/**
 * App-group error boundary. If a page's server render throws (e.g. a bad query
 * from odd filter params), show a friendly retry card instead of the bare
 * "server error occurred" screen — and let the user recover in one tap.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[APP_ERROR]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white ring-1 ring-slate-200 p-8 text-center mt-8">
      <h1 className="text-lg font-semibold text-slate-900">This page couldn’t load</h1>
      <p className="text-sm text-slate-500 mt-2">
        Something went wrong while loading this view. It’s usually temporary — try again, or clear your
        filters and reload.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
        >
          Try again
        </button>
        <a
          href="/leads"
          className="rounded-lg ring-1 ring-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50"
        >
          Go to Leads
        </a>
      </div>
      {error.digest ? (
        <p className="text-[11px] text-slate-400 mt-4">Reference: {error.digest}</p>
      ) : null}
    </div>
  );
}
