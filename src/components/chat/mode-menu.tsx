"use client";

import { Brain, CaretDown, ChartBar, Check, Code, Eye, Lightning } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MODE_CONFIG, MODE_LIST, type ChatMode } from "@/lib/ai/modes";
import { useShowReasoning } from "@/lib/chat/client/use-show-reasoning";
import { cn } from "@/lib/cn";

/**
 * The answer-mode picker that sits in the composer (like the mode menus in
 * ChatGPT, Claude and Gemini).
 *
 *  - One tap opens a list of the four modes with a one-line description each.
 *  - Works with a mouse, a thumb and the keyboard (↑ ↓ Enter Esc).
 *  - The "Show thinking" switch lives here because it only matters when a mode
 *    reasons before answering.
 *  - Only the small trigger button is on screen when closed, so the toolbar
 *    stays uncluttered on a phone.
 */
export const MODE_ICONS: Record<ChatMode, typeof Brain> = {
  thinking: Brain,
  fast: Lightning,
  coding: Code,
  analyze: ChartBar,
};

export function ModeMenu({
  mode,
  onChange,
  className,
}: {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const current = MODE_CONFIG[mode];
  const Icon = MODE_ICONS[mode];
  const [showReasoning, setShowReasoning] = useShowReasoning();

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  // Close on an outside tap; move focus into the menu on open; restore it after.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus({
      preventScroll: true,
    });
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      // Escape already returns focus to the trigger via close(); an outside tap
      // should leave focus wherever the person tapped.
    };
  }, [close, open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Answer mode: ${current.label}. Change answer mode`}
        title={`${current.label} · ${current.summary}`}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2 text-xs font-bold",
          "transition-[color,background-color] duration-200 hover:bg-surface-hover hover:text-fg",
          open ? "bg-surface-hover text-fg" : "text-muted",
        )}
      >
        <Icon
          weight={mode === "thinking" ? "fill" : "bold"}
          className="size-4 shrink-0 text-[var(--accent-text)]"
          aria-hidden
        />
        <span className="hidden min-[380px]:inline">{current.label}</span>
        <CaretDown
          weight="bold"
          className={cn(
            "size-3 shrink-0 text-subtle transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label="Answer mode"
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
            const index = items.indexOf(document.activeElement as HTMLElement);
            const step = event.key === "ArrowDown" ? 1 : -1;
            items[(index + step + items.length) % items.length]?.focus();
          }}
          className="glass-dropdown absolute bottom-full left-0 z-40 mb-2 w-[min(20rem,calc(100vw-2.5rem))] origin-bottom-left animate-scale-in rounded-2xl p-1.5"
        >
          <p className="px-3 pt-2 pb-1 font-mono text-[10px] font-bold tracking-[0.22em] text-subtle uppercase">
            Answer mode
          </p>

          {MODE_LIST.map((config) => {
            const ItemIcon = MODE_ICONS[config.id];
            const active = config.id === mode;
            return (
              <button
                key={config.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(config.id);
                  close();
                }}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150",
                  "hover:bg-surface-hover focus:bg-surface-hover focus:outline-none",
                  active && "bg-surface-hover",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line",
                    active ? "bg-inverse text-on-inverse" : "bg-surface-solid text-muted",
                  )}
                >
                  <ItemIcon weight={active ? "fill" : "bold"} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-extrabold text-fg">
                    {config.label}
                    {active && (
                      <Check weight="bold" className="size-3.5 text-[var(--accent-text)]" aria-hidden />
                    )}
                  </span>
                  <span className="block text-xs leading-snug text-muted">{config.summary}</span>
                </span>
              </button>
            );
          })}

          <div className="my-1.5 h-px bg-line" />

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={showReasoning}
            onClick={() => setShowReasoning(!showReasoning)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
          >
            <span
              aria-hidden
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-lg border border-line",
                showReasoning ? "bg-surface-hover text-fg" : "bg-surface-solid text-muted",
              )}
            >
              <Eye weight={showReasoning ? "fill" : "bold"} className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold text-fg">Show thinking</span>
              <span className="block text-xs leading-snug text-muted">
                Reveal the model&apos;s private notes. Never saved.
              </span>
            </span>
            <span
              aria-hidden
              className={cn(
                "relative h-6 w-10 shrink-0 rounded-full border border-line transition-colors duration-200",
                showReasoning ? "bg-[var(--accent)]/70" : "bg-surface-hover",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 size-4.5 rounded-full bg-surface-solid shadow transition-transform duration-200",
                  showReasoning && "translate-x-4",
                )}
              />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
