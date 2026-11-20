"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { EASE } from "@/lib/motion/tokens";

/**
 * Motion setup for every page that animates.
 *  - LazyMotion + the `m` component ship only the features we use (a third of
 *    the full bundle). `strict` throws if anyone imports the heavy `motion.*`.
 *  - reducedMotion="user": if the phone/computer asks for less motion,
 *    movement is switched off automatically (opacity still fades).
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.5, ease: EASE }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
