"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { AnimatePresence, m } from "motion/react";
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { EASE, SPRING } from "@/lib/motion/tokens";
import { useMuffleThemeAudio } from "@/lib/theme/use-theme-audio";

export type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  keywords?: string;
  run: () => void;
};

/**
 * ⌘K / Ctrl+K command palette.
 *
 * Keyboard: ↑ ↓ to move, Enter to run, Esc to close. The list is filtered as
 * you type. The inner panel is mounted fresh on every open, so the query always
 * starts empty without any state-syncing effect.
 */
export const CommandPalette = memo(function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  useMuffleThemeAudio(open, "command-palette");
  return (
    <AnimatePresence>
      {open && (
        <m.div
          key="palette"
          className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label="Close command menu"
            onClick={onClose}
            tabIndex={-1}
            className="absolute inset-0 bg-black/50 backdrop-blur-[3px]"
          />
          <PalettePanel onClose={onClose} commands={commands} />
        </m.div>
      )}
    </AnimatePresence>
  );
});

function PalettePanel({ onClose, commands }: { onClose: () => void; commands: Command[] }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const listId = useId();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(q));
  }, [commands, query]);

  // Move focus in on open, and back to where it was on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = results[active];
      if (command) {
        onClose();
        command.run();
      }
    } else if (event.key === "Tab") {
      // Keep focus inside the dialog.
      event.preventDefault();
      inputRef.current?.focus();
    }
  };

  return (
    <m.div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      initial={{ opacity: 0, y: -10, scale: 0.98, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -6, scale: 0.99, filter: "blur(6px)" }}
      transition={{ ...SPRING.soft, filter: { duration: 0.2 } }}
      className="relative w-full max-w-lg overflow-hidden rounded-3xl glass-dropdown"
    >
      <h2 id={titleId} className="sr-only">
        Commands
      </h2>

      <div className="flex items-center gap-3 border-b border-line px-4">
        <MagnifyingGlass weight="bold" className="size-4 shrink-0 text-subtle" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="Type a command…"
          aria-label="Search commands"
          aria-controls={listId}
          aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
          autoComplete="off"
          spellCheck={false}
          className="h-14 w-full bg-transparent text-[15px] font-semibold outline-none placeholder:text-subtle"
        />
        <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-subtle sm:block">
          Esc
        </kbd>
      </div>

      <ul id={listId} role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-2">
        {results.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-subtle">No commands match.</li>
        )}
        {results.map((command, index) => (
          <li key={command.id} id={`cmd-${command.id}`} role="option" aria-selected={index === active}>
            <m.button
              type="button"
              onClick={() => {
                onClose();
                command.run();
              }}
              onPointerMove={() => setActive(index)}
              layout
              transition={{ duration: 0.16, ease: EASE }}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold",
                "transition-colors duration-150",
                index === active ? "bg-surface-hover text-fg" : "text-muted",
              )}
            >
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-xl border border-line"
              >
                {command.icon}
              </span>
              <span className="flex-1 truncate">{command.label}</span>
              {command.hint && (
                <kbd className="hidden shrink-0 font-mono text-[10px] text-subtle sm:block">
                  {command.hint}
                </kbd>
              )}
            </m.button>
          </li>
        ))}
      </ul>
    </m.div>
  );
}
