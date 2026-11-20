"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { AnimatePresence, m } from "motion/react";
import { cn } from "@/lib/cn";
import { SPRING } from "@/lib/motion/tokens";
import type { ThemePreference } from "@/lib/theme";
import { useTheme } from "./theme-provider";

/**
 * Sun/moon button. The icon morphs (rotate + blur-fade) instead of swapping
 * instantly, which makes the theme change feel like one motion rather than a
 * flash. `resolved` comes from the theme store, so both icons are never in the
 * DOM at once.
 */
export function ThemeToggle({
  className,
  onToggled,
}: {
  className?: string;
  /** Called with the new theme (e.g. to save it to your profile). */
  onToggled?: (theme: ThemePreference) => void;
}) {
  const { resolved, setPreference } = useTheme();
  const next: ThemePreference = resolved === "dark" ? "light" : "dark";

  const toggle = () => {
    setPreference(next);
    onToggled?.(next);
  };

  return (
    <m.button
      type="button"
      onClick={toggle}
      aria-label="Switch between dark and light theme"
      title="Switch theme"
      whileTap={{ scale: 0.92 }}
      transition={SPRING.snappy}
      className={cn(
        "inline-flex tap relative items-center justify-center overflow-hidden rounded-xl text-muted",
        "transition-[color,background-color] duration-300 ease-premium",
        "hover:bg-surface-hover hover:text-fg",
        className,
      )}
    >
      <span className="relative grid size-5 place-items-center">
        <AnimatePresence initial={false} mode="wait">
          <m.span
            key={resolved}
            initial={{ opacity: 0, rotate: -70, scale: 0.6, filter: "blur(4px)" }}
            animate={{ opacity: 1, rotate: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, rotate: 70, scale: 0.6, filter: "blur(4px)" }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 grid place-items-center"
          >
            {resolved === "dark" ? (
              <Sun weight="bold" className="size-5" aria-hidden />
            ) : (
              <Moon weight="bold" className="size-5" aria-hidden />
            )}
          </m.span>
        </AnimatePresence>
      </span>
    </m.button>
  );
}
