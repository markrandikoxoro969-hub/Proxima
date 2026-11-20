"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Particles = dynamic(() => import("@/components/chat/particles"), { ssr: false });

/**
 * The floating dots behind the hero. Loaded only after the page is idle, so
 * they never slow down the first paint, and not at all on phones (≤767px) or
 * with reduced motion. Max 2× pixel density, paused when off-screen or the tab
 * is hidden, 30fps — see particles.tsx.
 */
export function HeroParticles() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Phones skip the canvas entirely: the CSS glow and orbit rings already
    // give the hero depth, and this is a full-screen animated canvas.
    const small = window.matchMedia("(max-width: 767px)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (small || reduced) return;
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(() => setReady(true), 1200);
    return () => clearTimeout(id);
  }, []);

  return ready ? (
    <Particles className="pointer-events-none absolute inset-0 -z-10 size-full [mask-image:linear-gradient(to_bottom,black_55%,transparent)]" />
  ) : null;
}
