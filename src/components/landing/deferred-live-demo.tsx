"use client";

import dynamic from "next/dynamic";
import { LazyMount } from "./lazy-mount";

/**
 * The live demo is one of the heaviest pieces of the landing page (it carries a
 * chat state machine and the stream reader). It sits well below the fold, so:
 *
 *   1. its JavaScript chunk is downloaded only when it is needed, and
 *   2. it mounts only when it comes within ~500px of the screen.
 *
 * That keeps the first paint of the hero free of demo code. The reserved height
 * means the page never jumps when it appears.
 */
const LiveDemo = dynamic(() => import("./live-demo").then((mod) => mod.LiveDemo), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-3xl" aria-hidden>
      <div className="h-[520px] animate-pulse rounded-[2rem] border border-line bg-surface-hover" />
    </div>
  ),
});

export function DeferredLiveDemo() {
  return (
    <LazyMount minHeight={520}>
      <LiveDemo />
    </LazyMount>
  );
}
