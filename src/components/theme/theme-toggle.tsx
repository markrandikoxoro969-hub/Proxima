"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
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
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between dark and light theme"
      title="Switch theme"
      className={cn(
        "relative inline-flex tap items-center justify-center overflow-hidden rounded-xl text-muted",
        "transition-[color,background-color,transform] duration-300 ease-premium",
        "hover:bg-surface-hover hover:text-fg active:scale-95",
        className,
      )}
    >
      <span className="relative grid size-5 place-items-center">
        {/* CSS-only swap: this button appears on every page, including the
            legal ones, so it must not pull the whole motion library in. */}
        <span
          key={resolved}
          aria-hidden
          className="theme-toggle-icon absolute inset-0 grid place-items-center"
        >
          {resolved === "dark" ? (
            <Sun weight="bold" className="size-5" />
          ) : (
            <Moon weight="bold" className="size-5" />
          )}
        </span>
      </span>
    </button>
  );
}
