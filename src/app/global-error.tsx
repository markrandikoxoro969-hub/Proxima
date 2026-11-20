"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last-resort error screen, used only if the root layout itself fails.
 * It replaces the whole page, so it brings its own <html> and <body>.
 */
export default function GlobalError({
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
    <html lang="en" className="dark">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg px-6 text-center font-sans text-fg">
        <h1 className="text-2xl font-black tracking-tight">PROXIMA hit a problem</h1>
        <p className="max-w-sm text-sm text-muted">
          Please try again. If it keeps happening, come back in a minute.
        </p>
        {error.digest && <p className="font-mono text-xs text-subtle">Error ID: {error.digest}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="tap rounded-2xl bg-inverse px-5 py-2.5 text-sm font-extrabold text-on-inverse"
          >
            Try again
          </button>
          {/* A plain link (full reload) is the safest way out when the app shell is broken. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="tap rounded-2xl border border-line px-5 py-2.5 text-sm font-extrabold">
            Go home
          </a>
        </div>
      </body>
    </html>
  );
}
