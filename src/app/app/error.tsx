"use client";

import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

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
      className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 pt-safe pb-safe text-center"
    >
      <WarningCircle weight="duotone" className="size-14 text-red-500" aria-hidden />
      <div>
        <h1 className="text-2xl font-black tracking-tight">Couldn&apos;t load PROXIMA</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          The server or database didn&apos;t respond. This usually fixes itself in a few seconds.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-subtle">Error ID: {error.digest}</p>}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={reset}>
          <ArrowClockwise weight="bold" className="size-5" aria-hidden /> Try again
        </Button>
        <ButtonLink href="/" variant="secondary">
          Go home
        </ButtonLink>
      </div>
    </main>
  );
}
