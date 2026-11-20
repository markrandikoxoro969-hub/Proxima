import { MagnifyingGlass } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { SimpleShell } from "@/components/layout/simple-shell";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** Shown for any address that doesn't exist (HTTP 404). */
export default function NotFound() {
  return (
    <SimpleShell>
      <main
        id="main"
        className="relative flex flex-1 flex-col items-center justify-center px-6 py-16 text-center"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 size-[60vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,var(--glow)_0%,transparent_65%)]"
        />
        <p
          aria-hidden
          className="relative animate-blur-in text-[clamp(6rem,28vw,12rem)] leading-none font-black tracking-tighter text-glow"
        >
          404
        </p>
        <h1 className="relative mt-4 text-2xl font-black tracking-tight sm:text-3xl">Lost in space</h1>
        <p className="relative mt-2 max-w-sm text-sm leading-relaxed text-muted">
          This page doesn&apos;t exist or was moved. Let&apos;s get you back on course.
        </p>
        <div className="relative mt-8 flex w-full max-w-xs flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
          <ButtonLink href="/">Go home</ButtonLink>
          <ButtonLink href="/app" variant="secondary">
            <MagnifyingGlass weight="bold" className="size-4" aria-hidden /> Ask Proxima
          </ButtonLink>
        </div>
      </main>
    </SimpleShell>
  );
}
