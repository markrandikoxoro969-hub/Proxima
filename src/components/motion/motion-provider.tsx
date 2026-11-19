"use client";

import { domAnimation, LazyMotion, MotionConfig } from "framer-motion";

/**
 * Framer Motion setup:
 *  - LazyMotion + `m` components ship only the animation features we use
 *    (much smaller than the full `motion` bundle). `strict` stops anyone
 *    accidentally importing the heavy version.
 *  - reducedMotion="user": if the phone/computer asks for less motion,
 *    movement animations are switched off automatically.
 */
export const EASE_PREMIUM = [0.16, 1, 0.3, 1] as const;

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.5, ease: EASE_PREMIUM }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
