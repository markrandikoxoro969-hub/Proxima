"use client";

import { Check, Palette } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { api } from "@/lib/chat/client/api";
import { cn } from "@/lib/cn";
import { getBuiltInTheme } from "@/lib/theme/palettes";

/**
 * The top-bar theme picker: one tap to Sky / Ocean / Nature (or back to the
 * default look). The full gallery with custom themes still lives in Settings.
 *
 * The choice is saved to the account (same call the Settings picker makes) and
 * to this device, so the next page load paints the right theme before anything
 * is visible — see themeInitScript in lib/theme.ts.
 */
const QUICK = [
  { id: "proxima", label: "Default", hint: "The original dark look" },
  { id: "daylight", label: "Light", hint: "Clean daylight" },
  { id: "sky", label: "Sky", hint: "Clouds and soft sun" },
  { id: "ocean", label: "Ocean", hint: "Waves and rising light" },
  { id: "nature", label: "Nature", hint: "Leaves and pollen" },
];

export function ThemeMenu() {
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
    const palette = getBuiltInTheme(id);
    api
      .updateProfile({ themePalette: id, ...(palette ? { theme: palette.mode } : {}) })
      .catch(() => {
        /* still applied on this device; Settings can retry the save */
      });
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
        <Palette weight="bold" className="size-5" aria-hidden />
        <span className="hidden sm:inline">{theme.scene ? theme.name : "Theme"}</span>
        <span className="sr-only sm:hidden">Change theme</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Theme"
          className="animate-fade-up absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-line bg-surface-solid p-1.5 shadow-glow-strong"
        >
          {QUICK.map((item) => {
            const palette = getBuiltInTheme(item.id);
            const active = theme.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => choose(item.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
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
                  <span className="block truncate text-sm font-extrabold">{item.label}</span>
                  <span className="block truncate text-[11px] text-subtle">{item.hint}</span>
                </span>
                {active && <Check weight="bold" className="size-4 shrink-0 text-[var(--accent-text)]" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
