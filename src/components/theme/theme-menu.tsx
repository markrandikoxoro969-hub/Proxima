"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/cn";
import { MEDIA_THEMES, getBuiltInTheme } from "@/lib/theme/palettes";

/**
 * The top-bar theme picker: one tap to any Live Video / Photo Aesthetic theme
 * or classic / procedural scene theme. Uses inline SVG glyphs so pages that
 * mount the header (like `/`) stay lean on first load.
 */
const QUICK_CLASSIC = [
  { id: "proxima", label: "Default", hint: "Quiet dark" },
  { id: "daylight", label: "Light", hint: "Clean daylight" },
  { id: "sky", label: "Sky", hint: "Clouds & sun" },
  { id: "ocean", label: "Ocean", hint: "Waves & glow" },
  { id: "nature", label: "Nature", hint: "Warm leaves" },
];

export function ThemeMenu({ syncAccount = true }: { syncAccount?: boolean }) {
  const { theme, setPalette } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Change theme"
        className="inline-flex tap items-center justify-center gap-2 rounded-xl px-3 text-xs font-extrabold tracking-[0.15em] text-muted uppercase transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 3a9 9 0 0 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1 0-4h4.5A4.5 4.5 0 0 0 21 7.5 9 9 0 0 0 12 3Z" />
          <circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" />
          <circle cx="11.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
        </svg>
        <span className="hidden sm:inline">{theme.scene ? theme.name : "Theme"}</span>
        <span className="sr-only sm:hidden">Change theme</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Theme"
          className="animate-fade-up absolute right-0 z-50 mt-2 max-h-[min(80dvh,32rem)] w-[min(21rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-line bg-surface-solid p-2.5 shadow-glow-strong"
        >
          <p className="px-1.5 pt-0.5 pb-2 text-[10px] font-extrabold tracking-[0.2em] text-subtle uppercase">
            Live &amp; Aesthetic Themes
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {MEDIA_THEMES.map((palette) => {
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
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                        style={{ objectPosition: palette.media?.position ?? "50% 40%" }}
                      />
                    )}
                    <span
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, rgb(0 0 0 / 0.08) 0%, rgb(0 0 0 / 0.68) 100%)",
                      }}
                    />
                    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-white uppercase backdrop-blur-xs">
                      {isVideo ? "▶ Live" : "✦ Photo"}
                    </span>
                    {active && (
                      <span
                        aria-hidden
                        className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-white text-black shadow"
                      >
                        <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4">
                          <path d="M3.5 8.5 6.5 11.5 12.5 5" strokeLinecap="round" strokeLinejoin="round" />
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

          <p className="mt-3 px-1.5 pb-1.5 text-[10px] font-extrabold tracking-[0.2em] text-subtle uppercase">
            Classic &amp; Scenes
          </p>
          <div className="flex flex-col gap-0.5">
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
                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-colors",
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
                      <path d="M3.5 8.5 6.5 11.5 12.5 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
