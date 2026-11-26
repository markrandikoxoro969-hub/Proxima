"use client";

import { Planet } from "@phosphor-icons/react";
import { m } from "motion/react";
import { Headline } from "@/components/motion/primitives";
import { EASE } from "@/lib/motion/tokens";

/** The first thing in a new chat: our Proxima planet emblem and a clear prompt to begin. */
export function EmptyState({ name: _name }: { name?: string }) {
  void _name;
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-10">
      <div className="w-full max-w-xl text-center">
        <m.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: EASE }}
          aria-hidden
          className="relative mx-auto mb-5 flex size-16 items-center justify-center"
        >
          <span className="absolute inset-0 animate-[spin_6s_linear_infinite] rounded-full border border-fg/12" />
          <span className="absolute inset-1.5 animate-[spin_3s_linear_infinite_reverse] rounded-full border border-transparent border-t-fg" />
          <Planet weight="fill" className="proxima-logo-glow size-7 animate-pulse text-fg" />
        </m.div>

        <Headline
          as="h2"
          text="What would you like to work on?"
          className="text-[clamp(1.85rem,6.5vw,3rem)] leading-[1.08] font-black tracking-tight"
        />

        <m.p
          initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.2 }}
          className="mx-auto mt-3.5 max-w-sm text-sm text-pretty text-muted sm:text-base"
        >
          Ask a question, explore an idea, paste an error, or attach a file.
        </m.p>
      </div>
    </div>
  );
}
