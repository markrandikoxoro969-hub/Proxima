"use client";

import Link from "next/link";
import { useEffect } from "react";

/** If loading the app fails (e.g. database waking up), show this instead of a crash. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center px-6 pt-safe pb-safe text-center"
    >
      <div className="glass-panel flex w-full max-w-md flex-col items-center gap-5 rounded-3xl p-7">
        <svg
          viewBox="0 0 24 24"
          className="size-14 text-red-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.14" />
          <path d="M12 8v5" />
          <circle cx="12" cy="16.5" r="0.75" fill="currentColor" stroke="none" />
        </svg>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Couldn&apos;t load PROXIMA</h1>
          <p className="mt-2 max-w-sm text-sm text-muted">
            The server or database didn&apos;t respond. This usually fixes itself in a few seconds.
          </p>
          {error.digest && <p className="mt-2 font-mono text-xs text-subtle">Error ID: {error.digest}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-inverse px-5 text-sm font-extrabold text-on-inverse shadow-glow transition-opacity hover:opacity-90"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            Try again
          </button>
          <Link
            href="/"
            className="glass-button inline-flex min-h-11 items-center justify-center rounded-2xl px-5 text-sm font-bold text-fg"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
