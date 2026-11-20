"use client";

import { m, type HTMLMotionProps, type Variants } from "motion/react";
import { cn } from "@/lib/cn";
import {
  BLUR_FADE,
  STAGGER_ITEM,
  STAGGER_LIST,
  VIEWPORT_ONCE,
  WORD_GROUP,
  WORD_REVEAL,
} from "@/lib/motion/tokens";

/**
 * Small building blocks so pages don't repeat variants.
 * Everything here uses `m` (LazyMotion) and animates only transform, opacity
 * and filter. Off-screen items wait for `whileInView`, so nothing runs unseen.
 */

type RevealProps = HTMLMotionProps<"div"> & { delay?: number; variants?: Variants };

/** Fades + un-blurs once when it scrolls into view. */
export function Reveal({ delay = 0, variants = BLUR_FADE, className, children, ...props }: RevealProps) {
  return (
    <m.div
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT_ONCE}
      variants={variants}
      transition={{ delay }}
      className={className}
      {...props}
    >
      {children}
    </m.div>
  );
}

/** Parent for a staggered list/section. Pair with <StaggerItem>. */
export function Stagger({
  className,
  children,
  ...props
}: HTMLMotionProps<"div"> & { children: React.ReactNode }) {
  return (
    <m.div
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT_ONCE}
      variants={STAGGER_LIST}
      className={className}
      {...props}
    >
      {children}
    </m.div>
  );
}

export function StaggerItem({ className, children, ...props }: HTMLMotionProps<"div">) {
  return (
    <m.div variants={STAGGER_ITEM} className={className} {...props}>
      {children}
    </m.div>
  );
}

/**
 * Word-by-word blur-to-sharp headline.
 * Words are real text nodes (selectable, readable by search engines); the
 * wrapping span is only needed for the stagger.
 */
export function Headline({
  text,
  className,
  as = "h2",
}: {
  text: string;
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  const words = text.split(" ");
  const Component = as === "h1" ? m.h1 : as === "h3" ? m.h3 : m.h2;
  return (
    <Component
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT_ONCE}
      variants={WORD_GROUP}
      className={cn("text-balance", className)}
    >
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="inline-block overflow-hidden">
          <m.span variants={WORD_REVEAL} className="inline-block">
            {word}
            {i < words.length - 1 ? "\u00A0" : ""}
          </m.span>
        </span>
      ))}
    </Component>
  );
}
