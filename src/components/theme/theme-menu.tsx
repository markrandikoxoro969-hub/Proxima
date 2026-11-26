"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/cn";
import { getBuiltInTheme, mediaThemesForDevice } from "@/lib/theme/palettes";
import { useThemeAudio } from "@/lib/theme/use-theme-audio";

const QUICK_CLASSIC = [
  { id: "proxima", label: "Default", hint: "Quiet dark" },
  { id: "daylight", label: "Light", hint: "Clean daylight" },
  { id: "sky", label: "Sky", hint: "Clouds & sun" },
  { id: "ocean", label: "Ocean", hint: "Waves & glow" },
  { id: "nature", label: "Nature", hint: "Warm leaves" },
];

/**
 * Reusable inner body of the Theme picker (Theme Sound slider + Live/Photo
 * aesthetic themes + Classic & Scene themes). Used both in standalone `<ThemeMenu />`
 * and inside the smoothly morphing header Controls popover.
 */
export function ThemeMenuContent({
  syncAccount = true,
  onAfterSelect,
}: {
  syncAccount?: boolean;
  onAfterSelect?: () => void;
}) {
  const { theme, device, setPalette } = useTheme();
  const audio = useThemeAudio();
  const deviceMediaThemes = mediaThemesForDevice(device);

  const choose = (id: string) => {
    setPalette(id);
    if (syncAccount) {
      const palette = getBuiltInTheme(id);
      void fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ themePalette: id, ...(palette ? { theme: palette.mode } : {}) }),
      }).catch(() => {
        /* still applied on this device; Settings can retry the save */
      });
    }
    onAfterSelect?.();
  };

  const soundActive = audio.enabled && !audio.blocked;

  return (
    <>
      {/* Theme Sound bar */}
      <div
        data-theme-audio-control="true"
        className="mb-3 flex items-center gap-2.5 rounded-xl border border-line bg-surface-hover/60 px-2.5 py-2"
      >
        <button
          type="button"
          data-theme-audio-control="true"
          onClick={audio.toggle}
          aria-pressed={soundActive}
          aria-label={audio.enabled ? "Mute theme sound" : "Enable theme sound"}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
            soundActive
              ? "bg-[var(--accent)]/15 text-[var(--accent-text)]"
              : "text-muted hover:text-fg",
          )}
        >
          {soundActive ? (
            <svg
              viewBox="0 0 24 24"
              className="size-4"
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
              className="size-4"
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
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-[10px] font-extrabold tracking-wider text-muted uppercase">
            <span>Theme Sound</span>
            <span className="font-mono text-subtle">
              {!audio.enabled
                ? "Off"
                : audio.blocked
                  ? "Tap to play"
                  : `${Math.round(audio.volume * 100)}%`}
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            data-theme-audio-control="true"
            aria-label="Theme sound volume"
            value={Math.round(audio.volume * 100)}
            onChange={(e) => audio.setVolume(Number(e.target.value) / 100)}
            className="mt-1 h-1.5 w-full cursor-pointer accent-[var(--accent)]"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-1 pt-0.5 pb-2">
        <p className="text-[10px] font-extrabold tracking-[0.2em] text-subtle uppercase">
          Live &amp; Aesthetic Themes
        </p>
        <span className="rounded-full border border-line bg-surface-hover px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-muted uppercase">
          {device === "mobile" ? "Mobile" : "Desktop"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-1.5">
        {deviceMediaThemes.map((palette) => {
          const active = theme.id === palette.id;
          const thumb = palette.media?.poster ?? palette.media?.src;
          const isVideo = palette.media?.kind === "video";
          return (
            <button
              key={palette.id}
              type="button"
              role="menuitem"
              onClick={() => choose(palette.id)}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-xl border text-left transition-[border-color,transform] duration-200 active:scale-[0.98]",
                active
                  ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/40"
                  : "border-line hover:border-line-strong",
              )}
            >
              <span className="relative block h-16 w-full overflow-hidden bg-surface-hover">
                {thumb && (
                  // Static local thumbnail from /public/media/themes.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    decoding="async"
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    style={{ objectPosition: palette.media?.position ?? "50% 40%" }}
                  />
                )}
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, rgb(0 0 0 / 0.08) 0%, rgb(0 0 0 / 0.72) 100%)",
                  }}
                />
                <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-white uppercase">
                  {isVideo ? "▶ Live" : "✦ Photo"}
                </span>
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-white text-black shadow"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      className="size-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                    >
                      <path
                        d="M3.5 8.5 6.5 11.5 12.5 5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
                <span className="absolute inset-x-2 bottom-1.5 flex items-center justify-between gap-1">
                  <span className="truncate text-xs font-extrabold text-white drop-shadow">
                    {palette.name}
                  </span>
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full ring-1 ring-white/50"
                    style={{ backgroundColor: palette.tokens.accent }}
                  />
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 px-1 pb-1.5 text-[10px] font-extrabold tracking-[0.2em] text-subtle uppercase">
        Classic &amp; Scenes
      </p>
      <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-col sm:gap-0.5">
        {QUICK_CLASSIC.map((item) => {
          const palette = getBuiltInTheme(item.id);
          const active = theme.id === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => choose(item.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors sm:py-1.5",
                active ? "bg-surface-hover" : "hover:bg-surface-hover",
              )}
            >
              <span
                aria-hidden
                className="size-5 shrink-0 rounded-full border border-line"
                style={{
                  backgroundColor: palette?.tokens.bg,
                  boxShadow: `inset 0 0 0 3px ${palette?.tokens.accent ?? "transparent"}`,
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-extrabold">{item.label}</span>
                <span className="block truncate text-[10px] text-subtle">{item.hint}</span>
              </span>
              {active && (
                <svg
                  viewBox="0 0 16 16"
                  className="size-4 shrink-0 text-[var(--accent-text)]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  aria-hidden
                >
                  <path
                    d="M3.5 8.5 6.5 11.5 12.5 5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * Standalone top-bar theme picker button + popover.
 */
export function ThemeMenu({ syncAccount = true }: { syncAccount?: boolean }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Change theme"
        className={cn(
          "relative inline-flex size-10 shrink-0 items-center justify-center gap-2 rounded-xl text-xs font-extrabold tracking-[0.14em] uppercase transition-colors duration-200 hover:bg-surface-hover sm:h-11 sm:w-auto sm:px-3",
          open || theme.media ? "text-fg" : "text-muted hover:text-fg",
        )}
      >
        <span className="relative inline-flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="size-[19px] sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 3a9 9 0 0 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1 0-4h4.5A4.5 4.5 0 0 0 21 7.5 9 9 0 0 0 12 3Z" />
            <circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="11.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
          </svg>
          {theme.media && (
            <span
              aria-hidden
              className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-surface-solid"
              style={{ backgroundColor: theme.tokens.accent }}
            />
          )}
        </span>
        <span className="hidden sm:inline">{theme.scene ? theme.name : "Theme"}</span>
        <span className="sr-only sm:hidden">Change theme</span>
      </button>

      {open && (
        <>
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/35 sm:hidden"
          />
          <div
            id={menuId}
            role="menu"
            aria-label="Theme"
            className="animate-fade-up fixed inset-x-3 top-[calc(max(0.5rem,env(safe-area-inset-top))+3.75rem)] z-50 max-h-[min(78dvh,34rem)] overflow-y-auto overscroll-contain rounded-2xl glass-dropdown p-3 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[22rem] sm:p-2.5"
          >
            <ThemeMenuContent syncAccount={syncAccount} onAfterSelect={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}
