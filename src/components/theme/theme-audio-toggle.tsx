"use client";

import { useTheme } from "@/components/theme/theme-provider";
import { useThemeAudio } from "@/lib/theme/use-theme-audio";
import { cn } from "@/lib/cn";

/**
 * Compact header toggle for theme sound (video audio tracks + ambient scenes).
 * Only renders when the active theme has sound (media themes or Sky/Ocean/Nature).
 * Uses inline SVGs so pages that mount the header stay lightweight.
 */
export function ThemeAudioToggle({ className }: { className?: string }) {
  const { theme } = useTheme();
  const { enabled, blocked, toggle } = useThemeAudio();

  const hasSound = Boolean(theme.media || theme.scene);
  if (!hasSound) return null;

  const active = enabled && !blocked;
  const label = blocked
    ? "Tap to enable theme sound"
    : enabled
      ? "Mute theme sound"
      : "Unmute theme sound";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "relative inline-flex tap items-center justify-center rounded-xl transition-colors duration-200 hover:bg-surface-hover",
        active ? "text-[var(--accent-text)]" : "text-muted hover:text-fg",
        className,
      )}
    >
      {active ? (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M11 5 6 9H3v6h3l5 4V5Z" strokeLinejoin="round" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M11 5 6 9H3v6h3l5 4V5Z" strokeLinejoin="round" />
          <path d="m22 9-6 6M16 9l6 6" strokeLinecap="round" />
        </svg>
      )}
      {blocked && (
        <span
          aria-hidden
          className="absolute top-2 right-2 size-2 rounded-full bg-[var(--accent)] ring-2 ring-surface-solid"
        />
      )}
    </button>
  );
}
