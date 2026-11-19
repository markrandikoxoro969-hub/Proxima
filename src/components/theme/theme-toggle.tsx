"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useTheme } from "./theme-provider";

/**
 * Sun/moon button. Both icons are rendered and CSS shows the right one,
 * so the server HTML always matches the browser (no hydration flicker).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between dark and light theme"
      title="Switch theme"
      className={cn(
        "inline-flex tap items-center justify-center rounded-xl text-muted",
        "transition-[color,background-color,transform] duration-300 ease-premium",
        "hover:bg-surface-hover hover:text-fg active:scale-95",
        className,
      )}
    >
      <Sun weight="bold" className="hidden size-5 dark:block" aria-hidden />
      <Moon weight="bold" className="size-5 dark:hidden" aria-hidden />
    </button>
  );
}
