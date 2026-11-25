"use client";

import { useTheme } from "@/components/theme/theme-provider";
import { useThemeAudio } from "@/lib/theme/use-theme-audio";
import { cn } from "@/lib/cn";

/**
 * Compact header toggle for theme music / ambient soundscapes.
 * Uses a distinct music-note glyph (so it never clashes with the AI Voice
 * speaker control in the chat header) and inline SVGs to keep `/` lean.
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
      data-theme-audio-control="true"
      onClick={toggle}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "relative inline-flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 hover:bg-surface-hover sm:size-11",
        active ? "bg-[var(--accent)]/12 text-[var(--accent-text)]" : "text-muted hover:text-fg",
        className,
      )}
    >
      {active ? (
        <svg
          viewBox="0 0 24 24"
          className="size-[18px] sm:size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9 18V6l11-2v12" />
          <circle cx="6.5" cy="18" r="2.5" />
          <circle cx="17.5" cy="16" r="2.5" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="size-[18px] sm:size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9 18V9m0-3 11-2v10" />
          <circle cx="6.5" cy="18" r="2.5" />
          <circle cx="17.5" cy="16" r="2.5" />
          <path d="m3 3 18 18" />
        </svg>
      )}
      {blocked && (
        <span
          aria-hidden
          className="absolute top-1.5 right-1.5 size-2 rounded-full bg-[var(--accent)] ring-2 ring-surface-solid"
        />
      )}
    </button>
  );
}
