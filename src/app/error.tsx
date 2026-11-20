"use client";

import { useEffect } from "react";

/**
 * If a page crashes, show a friendly message with "Try again" instead of a blank screen.
 * This file is loaded with EVERY page, so it uses no libraries (plain HTML + CSS classes)
 * to keep every page small.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const button =
    "tap inline-flex items-center justify-center rounded-2xl px-5 py-2.5 text-sm font-extrabold tracking-wide transition-[transform,background-color] duration-300 ease-premium active:scale-[0.97]";

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 pt-safe pb-safe text-center"
    >
      <svg viewBox="0 0 256 256" className="size-14 text-red-500" aria-hidden fill="currentColor">
        <path d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24Zm0 192a88 88 0 1 1 88-88 88.1 88.1 0 0 1-88 88Zm-8-80V80a8 8 0 0 1 16 0v56a8 8 0 0 1-16 0Zm20 36a12 12 0 1 1-12-12 12 12 0 0 1 12 12Z" />
      </svg>
      <div>
        <h1 className="text-2xl font-black tracking-tight">Something went wrong</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          This page hit an unexpected problem. Trying again usually fixes it.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-subtle">Error ID: {error.digest}</p>}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={reset} className={`${button} bg-inverse text-on-inverse shadow-glow`}>
          Try again
        </button>
        {/* A full reload is the safest way out after a crash. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className={`${button} border border-line bg-surface-hover text-fg`}>
          Go home
        </a>
      </div>
    </main>
  );
}
