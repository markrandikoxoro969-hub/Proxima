"use client";

import { m, useReducedMotion, useSpring } from "motion/react";
import { useRef } from "react";
import { Reveal } from "@/components/motion/primitives";
import { SPRING } from "@/lib/motion/tokens";
import { cn } from "@/lib/cn";

/**
 * Magnetic hover (desktop, mouse only).
 *
 * The wrapper stays still while the button leans toward the pointer. Movement
 * is a spring on transform — no layout, no React state, and it turns itself off
 * for touch screens and for people who ask for reduced motion.
 */
export function Magnetic({
  children,
  className,
  strength = 0.22,
}: {
  children: React.ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const x = useSpring(0, SPRING.soft);
  const y = useSpring(0, SPRING.soft);

  return (
    <m.span
      ref={ref}
      className={cn("inline-flex", className)}
      style={{ x, y }}
      onPointerMove={(event) => {
        if (reduced || event.pointerType !== "mouse") return;
        const box = ref.current?.getBoundingClientRect();
        if (!box) return;
        x.set((event.clientX - (box.left + box.width / 2)) * strength);
        y.set((event.clientY - (box.top + box.height / 2)) * strength * 1.4);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </m.span>
  );
}

/** Heading block for landing sections: short title, one-line description. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  text,
  className,
}: {
  id: string;
  eyebrow: string;
  title: string;
  text?: string;
  className?: string;
}) {
  return (
    <Reveal className={cn("mx-auto max-w-2xl text-center", className)}>
      <p className="text-xs font-bold tracking-wide text-subtle">{eyebrow}</p>
      <m.h2
        id={id}
        initial={{ opacity: 0.01, filter: "blur(8px)", y: 10 }}
        whileInView={{ opacity: 1, filter: "blur(0px)", y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="mt-3 text-4xl leading-[1.05] font-black tracking-tight text-balance sm:text-5xl"
      >
        {title}
      </m.h2>
      {text && <p className="mt-4 text-base leading-relaxed text-pretty text-muted sm:text-lg">{text}</p>}
    </Reveal>
  );
}
