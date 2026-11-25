"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";

const Particles = dynamic(() => import("@/components/chat/particles"), { ssr: false });

/**
 * The floating dots behind the hero. Skipped on phones, reduced motion, and
 * whenever a live media theme is active so the GPU stays smooth.
 */
export function HeroParticles() {
  const { theme } = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
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

  if (!ready || theme.media) return null;

  return (
    <Particles className="pointer-events-none absolute inset-0 -z-10 size-full [mask-image:linear-gradient(to_bottom,black_55%,transparent)]" />
  );
}
