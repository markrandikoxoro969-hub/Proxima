"use client";

import { m, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Scroll effects, driven by motion values — never by React state.
 *
 *   <Parallax speed={1}>  moves slower/faster than the page while it is on screen
 *   <ScrollFx />          a hairline reading-progress bar
 *
 * This used to also blur the hero and footer while scrolling fast. That was the
 * most expensive thing on the page (a `filter` on a full-width layer forces a
 * re-rasterise every frame), so it is gone — measured details in README →
 * Performance. The progress bar is one transform, which costs nothing.
 */
export function Parallax({
  children,
  speed = 0.4,
  className,
}: {
  children: React.ReactNode;
  /** 0 = still, 1 = strong. Keep decorative layers under 1.2. */
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const distance = 120 * speed;
  const rawY = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  const y = useSpring(rawY, { stiffness: 90, damping: 24, mass: 0.6 });

  return (
    <m.div ref={ref} style={reduced ? undefined : { y }} className={cn("will-change-transform", className)}>
      {children}
    </m.div>
  );
}

export function ScrollFx() {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 28 });

  return (
    <m.div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-fg/50"
      style={{ scaleX: progress }}
    />
  );
}
