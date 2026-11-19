"use client";

import { Atom, Bug, Code, Lightbulb } from "@phosphor-icons/react";
import { site } from "@/lib/site";

const SUGGESTIONS = [
  { icon: Code, title: "Write a clean Python script", prompt: "Write a clean Python script" },
  { icon: Atom, title: "Explain Quantum Physics simply", prompt: "Explain Quantum Physics simply" },
  {
    icon: Lightbulb,
    title: "Brainstorm app ideas",
    prompt: "Brainstorm 5 original app ideas for students in Nepal",
  },
  {
    icon: Bug,
    title: "Help me debug my code",
    prompt: "Help me find the bug in my code. I'll paste it next.",
  },
] as const;

/** Shown in a new chat: greeting + one-tap starter prompts. */
export function EmptyState({
  name,
  onPick,
  disabled,
}: {
  name: string;
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-5 py-8">
      <div className="w-full max-w-2xl text-center">
        <p className="animate-blur-in text-sm font-semibold text-muted">Hello, {name}</p>
        <h2 className="mt-2 animate-blur-in text-4xl font-black tracking-tight text-glow-strong [animation-delay:80ms] sm:text-6xl">
          HOW CAN I HELP?
        </h2>
        <p className="mt-3 animate-blur-in font-mono text-[10px] font-bold tracking-[0.3em] text-subtle uppercase [animation-delay:160ms]">
          {site.version.replace(" CORE", "")} Core API by {site.developer}
        </p>

        <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SUGGESTIONS.map(({ icon: Icon, title, prompt }, i) => (
            <li key={title} className="animate-fade-up" style={{ animationDelay: `${240 + i * 60}ms` }}>
              <button
                type="button"
                onClick={() => onPick(prompt)}
                disabled={disabled}
                className="group flex min-h-16 w-full items-center gap-4 rounded-2xl glass-solid px-5 py-4 text-left transition-[transform,border-color,box-shadow] duration-300 ease-premium hover:-translate-y-0.5 hover:border-line-strong hover:shadow-glow active:scale-[0.98] disabled:opacity-50"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-hover transition-transform duration-300 ease-premium group-hover:scale-110">
                  <Icon weight="bold" className="size-5" aria-hidden />
                </span>
                <span className="text-sm font-bold">{title}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
