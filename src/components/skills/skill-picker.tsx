"use client";

import { Check, CaretDown, Sparkle } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { memo, useEffect, useId, useRef, useState } from "react";
import type { EnabledSkillSummary } from "@/lib/skills/catalog";
import { MAX_SKILLS_PER_MESSAGE } from "@/lib/skills/constants";
import { cn } from "@/lib/cn";

const SkillIcon = dynamic(() => import("./skill-icon").then((module) => module.SkillIcon), {
  loading: () => <span className="size-4 rounded bg-surface-hover" aria-hidden />,
});

export const SkillPicker = memo(function SkillPicker({
  skills,
  selected,
  onChange,
  onOpen,
}: {
  skills: EnabledSkillSummary[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onOpen?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (onOpen) {
      setRefreshing(true);
      void onOpen()
        .catch(() => {})
        .finally(() => setRefreshing(false));
    }
  };

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((skillId) => skillId !== id));
      return;
    }
    if (selected.length >= MAX_SKILLS_PER_MESSAGE) return;
    onChange([...selected, id]);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={toggleOpen}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-bold transition-[color,background-color] duration-200",
          selected.length
            ? "bg-[var(--accent)]/12 text-[var(--accent-text)]"
            : "text-subtle hover:bg-surface-hover hover:text-fg",
        )}
      >
        <Sparkle weight={selected.length ? "fill" : "bold"} className="size-4" aria-hidden />
        Skills
        {selected.length > 0 && (
          <span className="grid size-4 place-items-center rounded-full bg-[var(--accent)]/15 text-[10px] tabular-nums">
            {selected.length}
          </span>
        )}
        <CaretDown
          weight="bold"
          className={cn("size-3 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={listId}
          role="dialog"
          aria-label="Skills for this message"
          aria-busy={refreshing}
          className="absolute bottom-full left-0 z-40 mb-2 w-[min(22rem,calc(100vw-1.5rem))] origin-bottom-left animate-scale-in rounded-2xl border border-line bg-surface-solid p-3 shadow-panel"
        >
          <div className="mb-2 flex items-start justify-between gap-3 px-1">
            <div>
              <p className="text-sm font-extrabold">Use a skill</p>
              <p className="mt-0.5 text-xs text-muted">
                Selected skills guide replies until you turn them off.
              </p>
            </div>
            <span className="shrink-0 pt-0.5 text-[10px] font-bold text-subtle">
              {selected.length}/{MAX_SKILLS_PER_MESSAGE}
            </span>
          </div>

          {refreshing ? (
            <p
              role="status"
              className="rounded-xl border border-line bg-surface-hover p-3 text-xs text-muted"
            >
              Refreshing your installed skills…
            </p>
          ) : skills.length ? (
            <ul className="max-h-64 space-y-1 overflow-y-auto" aria-label="Installed and enabled skills">
              {skills.map((skill) => {
                const active = selected.includes(skill.id);
                const maxed = !active && selected.length >= MAX_SKILLS_PER_MESSAGE;
                return (
                  <li key={skill.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      disabled={maxed}
                      onClick={() => toggle(skill.id)}
                      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 text-left transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-hover text-muted">
                        <SkillIcon icon={skill.icon} className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold">{skill.displayName}</span>
                        <span className="block truncate text-[10px] text-subtle">{skill.category}</span>
                      </span>
                      <span className="grid size-5 shrink-0 place-items-center rounded-md border border-line">
                        {active && (
                          <Check weight="bold" className="size-3.5 text-[var(--accent-text)]" aria-hidden />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-line p-3 text-xs leading-relaxed text-muted">
              No enabled skills yet. Install one to give Proxima a focused set of instructions for a reply.
            </p>
          )}

          <div className="mt-2 border-t border-line pt-2">
            <Link
              href="/skills"
              onClick={() => setOpen(false)}
              className="flex min-h-10 items-center justify-center rounded-xl px-3 text-xs font-bold text-muted transition-colors hover:bg-surface-hover hover:text-fg"
            >
              Browse and manage skills
            </Link>
          </div>
        </div>
      )}
    </div>
  );
});
