"use client";

import { Check, Drop, FilmStrip, Image as ImageIcon, Moon, Plus, Sun, Trash } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/chat/client/api";
import { cn } from "@/lib/cn";
import {
  CUSTOM_THEME_LIMIT,
  MEDIA_THEMES,
  ThemeError,
  customThemeColors,
  customThemePayload,
  themesForMode,
  type ThemeMode,
  type ThemePalette,
} from "@/lib/theme/palettes";
import type { ThemePreference } from "@/lib/theme";

/**
 * Theme picker: dark / light / system, a gallery of built-in themes, and a
 * small builder for your own theme (three colours, everything else derived).
 *
 * Changes preview instantly and are saved to the account straight away, so the
 * same look follows you to your phone. The surrounding Save button also sends
 * them, which keeps things consistent whichever way you leave the page.
 */
export function ThemePicker({
  notify,
  className,
}: {
  notify?: (message: string, kind?: "info" | "success" | "error") => void;
  className?: string;
}) {
  const {
    preference,
    resolved,
    theme,
    customThemes,
    setPreference,
    setPalette,
    saveCustomTheme,
    deleteCustomTheme,
  } = useTheme();
  const [builderOpen, setBuilderOpen] = useState(false);

  /** Fire-and-forget save to the account (the theme already applies locally). */
  const persist = (patch: {
    theme?: ThemePreference;
    themePalette?: string;
    customThemes?: ThemePalette[];
  }) => {
    api
      .updateProfile({
        ...(patch.theme ? { theme: patch.theme } : {}),
        ...(patch.themePalette ? { themePalette: patch.themePalette } : {}),
        ...(patch.customThemes ? { customThemes: patch.customThemes.map(customThemePayload) } : {}),
      })
      .catch(() => {
        /* still applied on this device; the Save button can retry */
      });
  };

  const chooseMode = (mode: ThemePreference) => {
    setPreference(mode);
    persist({ theme: mode });
  };

  const choosePalette = (palette: ThemePalette) => {
    setPalette(palette.id);
    persist({ themePalette: palette.id, theme: palette.mode });
  };

  const onSaveCustom = (input: {
    name: string;
    mode: ThemeMode;
    colors: { bg: string; fg: string; accent: string };
  }) => {
    try {
      const created = saveCustomTheme(input);
      const next = [created, ...customThemes.filter((t) => t.id !== created.id)].slice(0, CUSTOM_THEME_LIMIT);
      persist({ themePalette: created.id, theme: created.mode, customThemes: next });
      notify?.(`“${created.name}” is ready.`, "success");
      setBuilderOpen(false);
    } catch (error) {
      notify?.(error instanceof ThemeError ? error.message : "That theme isn't valid.", "error");
    }
  };

  const onDeleteCustom = (palette: ThemePalette) => {
    deleteCustomTheme(palette.id);
    const next = customThemes.filter((t) => t.id !== palette.id);
    persist({ customThemes: next, themePalette: next[0]?.id ?? "proxima" });
    notify?.(`“${palette.name}” deleted.`, "success");
  };

  const visibleCustom = customThemes.filter((t) => t.mode === resolved);
  const classicForMode = themesForMode(resolved).filter((t) => !t.media);

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {/* Mode */}
      <fieldset>
        <legend className="mb-2 text-xs font-extrabold tracking-[0.2em] text-muted uppercase">Mode</legend>
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface-hover p-1">
          {(["dark", "light", "system"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => chooseMode(option)}
              aria-pressed={preference === option}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-bold capitalize transition-colors duration-200",
                preference === option ? "bg-inverse text-on-inverse" : "text-muted hover:text-fg",
              )}
            >
              {option === "dark" ? (
                <Moon weight="bold" className="size-4" aria-hidden />
              ) : option === "light" ? (
                <Sun weight="bold" className="size-4" aria-hidden />
              ) : null}
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Live Video & Photo Aesthetic Themes */}
      <fieldset>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <legend className="text-xs font-extrabold tracking-[0.2em] text-muted uppercase">
            Live &amp; aesthetic themes
          </legend>
          <span className="text-[11px] font-semibold text-subtle">Motion &amp; wallpapers</span>
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MEDIA_THEMES.map((palette) => {
            const active = theme.id === palette.id;
            const thumb = palette.media?.poster ?? palette.media?.src;
            const isVideo = palette.media?.kind === "video";
            return (
              <li key={palette.id}>
                <button
                  type="button"
                  onClick={() => choosePalette(palette)}
                  aria-pressed={active}
                  className={cn(
                    "group flex w-full flex-col gap-2 rounded-2xl border p-2 text-left transition-[border-color,background-color,transform] duration-200",
                    active
                      ? "border-fg/50 bg-surface-hover"
                      : "border-line hover:border-line-strong hover:bg-surface-hover/60",
                  )}
                >
                  <span
                    aria-hidden
                    className="relative flex h-16 w-full items-end justify-between overflow-hidden rounded-xl border border-line p-1.5"
                    style={{ backgroundColor: palette.tokens.bg }}
                  >
                    {thumb && (
                      // Static local poster from /public/media/themes.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
                        style={{ objectPosition: palette.media?.position ?? "50% 40%" }}
                      />
                    )}
                    <span
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, rgb(0 0 0 / 0.1) 0%, rgb(0 0 0 / 0.52) 100%)",
                      }}
                    />
                    <span className="relative z-10 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-white uppercase">
                      {isVideo ? (
                        <FilmStrip weight="fill" className="size-2.5" aria-hidden />
                      ) : (
                        <ImageIcon weight="fill" className="size-2.5" aria-hidden />
                      )}
                      {isVideo ? "Live" : "Photo"}
                    </span>
                    <span
                      className="relative z-10 size-3.5 rounded-full ring-1 ring-white/60"
                      style={{ backgroundColor: palette.tokens.accent }}
                    />
                  </span>
                  <span className="flex items-center justify-between gap-1 px-0.5">
                    <span className="truncate text-xs font-extrabold">{palette.name}</span>
                    {active && <Check weight="bold" className="size-3.5 shrink-0" aria-hidden />}
                  </span>
                  <span className="line-clamp-2 px-0.5 text-[10px] leading-snug font-medium text-subtle">
                    {palette.description}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {/* Classic Gallery */}
      <fieldset>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <legend className="text-xs font-extrabold tracking-[0.2em] text-muted uppercase">
            {resolved === "dark" ? "Dark palettes" : "Light palettes"}
          </legend>
          <span className="text-[11px] font-semibold text-subtle">Tap to preview</span>
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[...classicForMode, ...visibleCustom].map((palette) => {
            const active = theme.id === palette.id;
            return (
              <li key={palette.id} className="relative">
                <button
                  type="button"
                  onClick={() => choosePalette(palette)}
                  aria-pressed={active}
                  className={cn(
                    "group flex w-full flex-col gap-2 rounded-2xl border p-2.5 text-left transition-[border-color,background-color,transform] duration-200",
                    active
                      ? "border-fg/40 bg-surface-hover"
                      : "border-line hover:border-line-strong hover:bg-surface-hover/60",
                  )}
                >
                  <span
                    aria-hidden
                    className="flex h-12 w-full items-end justify-end gap-1 overflow-hidden rounded-xl border border-line p-1.5"
                    style={{
                      backgroundColor: palette.tokens.bg,
                      backgroundImage: `radial-gradient(120% 90% at 20% 0%, ${palette.tokens.accentSoft}, transparent 70%)`,
                    }}
                  >
                    <span
                      className="size-4 rounded-full"
                      style={{ backgroundColor: palette.tokens.accent }}
                    />
                    <span
                      className="size-4 rounded-full border"
                      style={{
                        backgroundColor: palette.tokens.surfaceSolid,
                        borderColor: palette.tokens.lineStrong,
                      }}
                    />
                  </span>
                  <span className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-extrabold" style={{ color: palette.tokens.fg }}>
                      {palette.name}
                    </span>
                    {active && <Check weight="bold" className="size-3.5 shrink-0" aria-hidden />}
                  </span>
                  <span className="line-clamp-2 text-[10px] leading-snug font-medium text-subtle">
                    {palette.description}
                  </span>
                </button>
                {palette.custom && (
                  <button
                    type="button"
                    onClick={() => onDeleteCustom(palette)}
                    aria-label={`Delete ${palette.name}`}
                    className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/40 text-white/90 transition-colors duration-200 hover:bg-red-500 hover:text-white"
                  >
                    <Trash weight="bold" className="size-3.5" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}

          {customThemes.length < CUSTOM_THEME_LIMIT && (
            <li>
              <button
                type="button"
                onClick={() => setBuilderOpen((open) => !open)}
                aria-expanded={builderOpen}
                className="flex h-full min-h-[6.5rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong p-2.5 text-xs font-bold text-muted transition-colors duration-200 hover:border-fg/40 hover:text-fg"
              >
                <Plus weight="bold" className="size-5" aria-hidden />
                Create your own
              </button>
            </li>
          )}
        </ul>
      </fieldset>

      {builderOpen && (
        <CustomThemeBuilder base={theme} onCancel={() => setBuilderOpen(false)} onSave={onSaveCustom} />
      )}

      <p className="text-[11px] text-subtle">
        {customThemes.length}/{CUSTOM_THEME_LIMIT} of your own themes used. Text colours are checked for
        readability automatically.
      </p>
    </div>
  );
}

/** The three-colour editor. Everything else (muted text, lines, glass) is derived. */
function CustomThemeBuilder({
  base,
  onSave,
  onCancel,
}: {
  base: ThemePalette;
  onSave: (input: {
    name: string;
    mode: ThemeMode;
    colors: { bg: string; fg: string; accent: string };
  }) => void;
  onCancel: () => void;
}) {
  const colors = customThemeColors(base);
  const [name, setName] = useState("My theme");
  const [mode, setMode] = useState<ThemeMode>(base.mode);
  const [bg, setBg] = useState(colors.bg);
  const [fg, setFg] = useState(colors.fg);
  const [accent, setAccent] = useState(colors.accent);
  const ids = { name: useId(), bg: useId(), fg: useId(), accent: useId() };

  return (
    <div className="rounded-2xl border border-line bg-surface-hover/50 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-extrabold">
        <Drop weight="bold" className="size-4" aria-hidden /> Your theme
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={ids.name}
            className="text-[11px] font-extrabold tracking-[0.15em] text-muted uppercase"
          >
            Name
          </label>
          <input
            id={ids.name}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            className="input"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-extrabold tracking-[0.15em] text-muted uppercase">Base</span>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-solid p-1">
            {(["dark", "light"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                aria-pressed={mode === option}
                className={cn(
                  "inline-flex min-h-9 items-center justify-center gap-1 rounded-lg text-xs font-bold capitalize transition-colors duration-200",
                  mode === option ? "bg-inverse text-on-inverse" : "text-muted hover:text-fg",
                )}
              >
                {option === "dark" ? (
                  <Moon weight="bold" className="size-3.5" aria-hidden />
                ) : (
                  <Sun weight="bold" className="size-3.5" aria-hidden />
                )}
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {(
          [
            { id: ids.bg, label: "Background", value: bg, set: setBg },
            { id: ids.fg, label: "Text", value: fg, set: setFg },
            { id: ids.accent, label: "Accent", value: accent, set: setAccent },
          ] as const
        ).map((field) => (
          <div key={field.id} className="flex flex-col gap-1.5">
            <label
              htmlFor={field.id}
              className="text-[11px] font-extrabold tracking-[0.15em] text-muted uppercase"
            >
              {field.label}
            </label>
            <span className="flex items-center gap-2 rounded-xl border border-line bg-surface-solid p-1.5">
              <input
                id={field.id}
                type="color"
                value={field.value}
                onChange={(event) => field.set(event.target.value)}
                className="size-7 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
              />
              <span className="truncate font-mono text-[11px] font-bold text-muted uppercase">
                {field.value}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSave({ name, mode, colors: { bg, fg, accent } })}>
          <Check weight="bold" className="size-4" aria-hidden /> Save theme
        </Button>
      </div>
    </div>
  );
}
