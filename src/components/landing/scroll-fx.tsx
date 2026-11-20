"use client";

import {
  m,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Scroll effects, driven by motion values — never by React state.
 *
 *   <Parallax speed={1}>  moves slower/faster than the page while it is on screen
 *   <ScrollFx />          a hairline progress bar + a velocity blur on fast scroll
 *
 * The blur is CSS-only (`filter`, max 2.5px) and is switched off on phones and
 * for reduced motion, so scrolling stays at 60fps where it matters.
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
  const reduced = useReducedMotion();
  const { scrollY, scrollYProgress } = useScroll();
  const velocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(velocity, { stiffness: 120, damping: 30 });
  const blur = useTransform(smoothVelocity, (v) => {
    const px = (Math.abs(v) - 900) / 1100;
    return Math.min(Math.max(px, 0), 2.5);
  });
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 28 });
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px) and (prefers-reduced-motion: no-preference)");
    const sync = () => setDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Write straight to CSS: no component re-renders while scrolling.
  useMotionValueEvent(blur, "change", (value) => {
    if (!desktop || reduced) return;
    document.documentElement.style.setProperty("--vblur", `${value.toFixed(2)}px`);
  });

  useEffect(() => {
    if (desktop && !reduced) return;
    document.documentElement.style.removeProperty("--vblur");
  }, [desktop, reduced]);

  return (
    <m.div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-fg/50"
      style={{ scaleX: progress }}
    />
  );
}
