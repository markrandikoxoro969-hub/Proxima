"use client";

import { Check, Code, Diamond, Lightning, Sparkle } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { useChatMode } from "@/lib/chat/client/use-chat-mode";
import { cn } from "@/lib/cn";
import { MODES, type ChatMode } from "@/lib/ai/modes";

const ICONS: Record<ChatMode, React.ComponentType<{ weight?: "bold" | "fill"; className?: string }>> = {
  thinking: Sparkle,
  fast: Lightning,
  pro: Diamond,
  coding: Code,
};

/**
 * Thinking · Fast · Pro · Coding, one tap in the composer.
 *
 * The choice lives on the device (useChatMode) and rides along with every
 * message, so switching mode never needs a round-trip — the next send is
 * already in the new mode.
 */
export function ModePicker() {
  const [mode, setMode] = useChatMode();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = MODES.find((item) => item.id === mode) ?? MODES[0];
  const Icon = ICONS[current.id];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node | null)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        title={`Answer mode: ${current.label} — ${current.blurb}`}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-2.5 text-xs font-bold text-muted transition-colors",
          "hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
          open && "bg-surface-hover text-fg",
        )}
      >
        <Icon weight="bold" className="size-3.5" aria-hidden />
        {current.label}
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Answer mode"
          className="animate-fade-up absolute bottom-full left-0 z-50 mb-2 w-[17.5rem] rounded-2xl border border-line bg-surface-solid p-1.5 shadow-glow-strong"
        >
          {MODES.map((item) => {
            const ItemIcon = ICONS[item.id];
            const active = item.id === mode;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setMode(item.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                  active ? "bg-surface-hover" : "hover:bg-surface-hover",
                )}
              >
                <ItemIcon weight="bold" className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-extrabold">
                    {item.label}
                    {active && <Check weight="bold" className="size-3.5 text-[var(--accent)]" aria-hidden />}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">{item.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
