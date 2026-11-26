"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ToastProvider, useToast } from "@/components/ui/toast";

const StudioWorkspace = dynamic(
  () => import("@/components/image/image-studio").then((m) => m.StudioWorkspace),
  {
    loading: () => (
      <div className="flex min-h-[16rem] items-center justify-center text-muted">
        <Spinner className="size-6" label="Loading image studio" />
      </div>
    ),
  },
);

export function StudioPageView() {
  return (
    <ToastProvider>
      <StudioPageInner />
    </ToastProvider>
  );
}

function StudioPageInner() {
  const notify = useToast();

  return (
    <div className="min-h-dvh pt-safe pr-safe pb-safe pl-safe">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <ButtonLink href="/app" variant="ghost" className="px-3 whitespace-nowrap">
            <ArrowLeft weight="bold" className="size-4" aria-hidden /> Back to chat
          </ButtonLink>
          <ThemeToggle />
        </div>
      </header>

      <main id="main" className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pb-20 sm:px-6">
        <div className="animate-fade-up pt-3 pb-1">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Image Studio</h1>
          <p className="mt-2 text-sm text-muted">
            Create pictures from a prompt or upload one and describe the change.
          </p>
        </div>

        <section className="glass-panel rounded-3xl p-5 sm:p-7">
          <StudioWorkspace notify={notify} />
        </section>
      </main>
    </div>
  );
}
