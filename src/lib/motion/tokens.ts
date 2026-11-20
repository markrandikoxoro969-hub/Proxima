/**
 * One place for every motion value. Import these instead of writing new
 * springs inline, so the whole app moves at the same rhythm.
 *
 * Rules (see docs/DESIGN-BRIEF.md):
 *   - animate transform, opacity and filter only
 *   - blur ≤ 12px on phones (8px on text)
 *   - no ambient loops; motion answers an action
 */
import type { Transition, Variants } from "motion/react";

/** The signature curve: fast start, soft landing. */
export const EASE = [0.16, 1, 0.3, 1] as const;
export const EASE_CSS = "cubic-bezier(0.16, 1, 0.3, 1)";

export const DURATION = {
  fast: 0.18,
  base: 0.32,
  slow: 0.6,
} as const;

export const SPRING = {
  /** Buttons, pills, small panels. */
  soft: { type: "spring", stiffness: 210, damping: 26, mass: 0.9 },
  /** Drawers and sheets. */
  gentle: { type: "spring", stiffness: 120, damping: 20, mass: 1 },
  /** Toggles that should feel instant. */
  snappy: { type: "spring", stiffness: 380, damping: 30 },
} as const satisfies Record<string, Transition>;

/** Short blur-fade used by pages, modals and toasts. */
export const BLUR_FADE: Variants = {
  hidden: { opacity: 0, filter: "blur(8px)", y: 8 },
  show: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    transition: { duration: DURATION.base, ease: EASE },
  },
  exit: {
    opacity: 0,
    filter: "blur(6px)",
    y: -4,
    transition: { duration: DURATION.fast, ease: EASE },
  },
};

/** Parent of a list: children arrive one after another. */
export const STAGGER_LIST: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

/** A single list row / card. */
export const STAGGER_ITEM: Variants = {
  hidden: { opacity: 0, y: 12, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.45, ease: EASE } },
};

/** Headline: each word goes blur → sharp. */
export const WORD_REVEAL: Variants = {
  hidden: { opacity: 0.01, filter: "blur(8px)", y: "0.22em" },
  show: {
    opacity: 1,
    filter: "blur(0px)",
    y: "0em",
    transition: { duration: 0.9, ease: EASE },
  },
};

export const WORD_GROUP: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
};

/** Page/section shell that animates once when it scrolls into view. */
export const VIEWPORT_ONCE = { once: true, amount: 0.25 } as const;

/** Delay helper for simple sequences. */
export const delay = (seconds: number): Transition => ({ duration: DURATION.base, ease: EASE, delay: seconds });
