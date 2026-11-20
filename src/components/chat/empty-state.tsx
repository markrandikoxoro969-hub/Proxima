"use client";

import { m } from "motion/react";
import { Headline } from "@/components/motion/primitives";
import { EASE } from "@/lib/motion/tokens";

/**
 * The first thing you see in a new chat.
 *
 * One headline, one line of guidance, one gradient-mesh light source and a
 * 3% noise layer. No cards, no example buttons, no "How can I help?" — the
 * message box below is the call to action.
 */
export function EmptyState({ name }: { name: string }) {
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-10">
      <div aria-hidden className="ai-mesh" />
      <div aria-hidden className="noise-layer" />

      <div className="relative w-full max-w-xl text-center">
        <m.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="text-sm font-semibold text-muted"
        >
          Hello, {name}
        </m.p>

        <Headline
          as="h2"
          text="What are we building?"
          className="mt-3 text-[clamp(2.25rem,9vw,3.75rem)] leading-[1.02] font-black tracking-tight text-glow"
        />

        <m.p
          initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.25 }}
          className="mx-auto mt-4 max-w-sm text-pretty text-muted"
        >
          Ask a question, paste an error, or attach a file.
        </m.p>

        <m.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="mt-10 hidden text-[11px] font-semibold tracking-wide text-subtle sm:block"
        >
          Press{" "}
          <kbd className="rounded-md border border-line bg-surface-hover px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>{" "}
          for commands
        </m.p>
      </div>
    </div>
  );
}
