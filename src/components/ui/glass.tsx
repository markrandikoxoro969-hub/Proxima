import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Reusable PROXIMA glassmorphism primitives.
 *
 * All visual properties come from the theme-aware `--glass-*` tokens in
 * `src/app/globals.css` so dark smoked glass, light frosted glass, colorful
 * palettes, and live-media themes stay visually cohesive and GPU-safe.
 */

export function GlassPanel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-3xl glass-panel p-5 sm:p-7", className)} {...props} />;
}

export function GlassCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl glass-card p-4 hover:border-[var(--glass-border-strong)]",
        className,
      )}
      {...props}
    />
  );
}

export function GlassMenu({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl glass-dropdown p-1.5", className)} {...props} />;
}

export function GlassInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl glass-input px-3 text-sm font-medium text-fg placeholder:text-subtle",
        "focus:border-[var(--accent)] focus:bg-surface-solid/80 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function GlassPill({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full glass-pill px-2.5 py-1 text-[11px] font-bold text-muted",
        className,
      )}
      {...props}
    />
  );
}
