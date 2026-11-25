"use client";

import dynamic from "next/dynamic";
import { LazyMount } from "./lazy-mount";

/**
 * The live demo (and its peeking companion) sits well below the fold, so both
 * chunks download only when the visitor scrolls near the demo.
 */
const LiveDemo = dynamic(() => import("./live-demo").then((mod) => mod.LiveDemo), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-3xl" aria-hidden>
      <div className="h-[520px] animate-pulse rounded-[2rem] border border-line bg-surface-hover" />
    </div>
  ),
});

const ComposerPeeker = dynamic(
  () => import("@/components/chat/composer-vibes").then((mod) => mod.ComposerPeeker),
  { ssr: false },
);

export function DeferredLiveDemo() {
  return (
    <LazyMount minHeight={520}>
      <div className="relative mx-auto w-full max-w-3xl">
        <ComposerPeeker focused={false} typing={false} streaming={false} className="md:bottom-4" />
        <LiveDemo />
      </div>
    </LazyMount>
  );
}
