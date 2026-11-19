"use client";

import { ArrowRight, Planet, WarningCircle } from "@phosphor-icons/react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/chat/client/api";
import type { Profile } from "@/lib/chat/types";
import { NAME_MAX } from "./settings-dialog";

const WORD = "Proxima";
const TYPE_MS = 90;
const LOADING_LINES = [
  "Syncing Core System…",
  "Initializing Brain…",
  "Securing Data Gateways…",
  "System Ready.",
];
const LOADING_MS = 3000;

type Step = "intro" | "name" | "age" | "loading";

const stepMotion = {
  initial: { opacity: 0, y: 16, filter: "blur(10px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -12, filter: "blur(8px)" },
  transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
};

/**
 * First-visit welcome: typed logo → your name → your age → system boot.
 * Your answers are saved to your account (not the browser).
 */
export function Onboarding({ profile, onDone }: { profile: Profile; onDone: (profile: Profile) => void }) {
  const [step, setStep] = useState<Step>("intro");
  const [name, setName] = useState(
    profile.displayName ?? profile.name?.split(" ")[0]?.slice(0, NAME_MAX) ?? "",
  );
  const [age, setAge] = useState(profile.age ? String(profile.age) : "");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Proxima"
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-bg px-6 pt-safe pb-safe"
    >
      <AnimatePresence mode="wait">
        {step === "intro" && (
          <m.div key="intro" {...stepMotion} className="flex flex-col items-center text-center">
            <Intro onNext={() => setStep("name")} />
          </m.div>
        )}
        {step === "name" && (
          <m.div key="name" {...stepMotion} className="w-full max-w-sm">
            <Question
              label="What should I call you?"
              hint="This is how Proxima will greet you."
              value={name}
              onChange={(v) => setName(v.slice(0, NAME_MAX))}
              onNext={() => name.trim() && setStep("age")}
              valid={name.trim().length > 0}
              autoComplete="given-name"
              maxLength={NAME_MAX}
            />
          </m.div>
        )}
        {step === "age" && (
          <m.div key="age" {...stepMotion} className="w-full max-w-sm">
            <Question
              label="How old are you?"
              hint="Helps Proxima explain things at the right level."
              value={age}
              onChange={(v) => setAge(v.replace(/\D/g, "").slice(0, 3))}
              onNext={() => validAge(age) && setStep("loading")}
              valid={validAge(age)}
              inputMode="numeric"
              error={age && !validAge(age) ? "Enter an age from 1 to 120." : undefined}
            />
          </m.div>
        )}
        {step === "loading" && (
          <m.div key="loading" {...stepMotion} className="w-full max-w-xs">
            <Boot name={name.trim()} age={Number(age)} onDone={onDone} />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const validAge = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 120;
};

function Intro({ onNext }: { onNext: () => void }) {
  const reduced = useReducedMotion();
  const [typed, setTyped] = useState(reduced ? WORD.length : 0);
  const done = typed >= WORD.length;

  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
    return () => clearTimeout(t);
  }, [typed, done]);

  return (
    <>
      <div className="relative flex size-44 items-center justify-center sm:size-52" aria-hidden>
        <span className="orbit-ring absolute inset-0 rounded-full border border-line-strong" />
        <span className="orbit-ring orbit-ring--reverse absolute inset-5 rounded-full border border-dashed border-line-strong" />
        <span className="orbit-ring absolute inset-10 rounded-full border border-line [animation-duration:14s]" />
        <Planet weight="fill" className="size-14 drop-shadow-[0_0_25px_var(--glow)]" />
      </div>
      <h1
        className="mt-8 h-14 text-5xl font-black tracking-tight text-glow-strong sm:text-6xl"
        aria-label={WORD}
      >
        <span aria-hidden>{WORD.slice(0, typed)}</span>
        <span aria-hidden className={done ? "caret-blink" : ""}>
          |
        </span>
      </h1>
      <p className="mt-3 text-xs font-bold tracking-[0.35em] text-subtle uppercase">Premium Core AI</p>
      <div className={done ? "mt-10 animate-blur-in" : "invisible mt-10"}>
        <Button size="lg" onClick={onNext} autoFocus={done}>
          Initialize <ArrowRight weight="bold" className="size-4" aria-hidden />
        </Button>
      </div>
    </>
  );
}

function Question({
  label,
  hint,
  value,
  onChange,
  onNext,
  valid,
  error,
  ...inputProps
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  valid: boolean;
  error?: string;
} & Pick<React.ComponentProps<"input">, "inputMode" | "autoComplete" | "maxLength">) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      className="flex flex-col"
    >
      <label htmlFor="onboarding-input" className="text-3xl font-black tracking-tight sm:text-4xl">
        {label}
      </label>
      <p className="mt-2 text-sm text-muted">{hint}</p>
      <input
        id="onboarding-input"
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? "onboarding-error" : undefined}
        className="mt-8 h-14 w-full rounded-2xl border border-line-strong bg-surface-solid px-5 text-lg font-bold focus:border-fg focus:outline-none"
        {...inputProps}
      />
      <p id="onboarding-error" className="mt-2 min-h-5 text-xs font-semibold text-red-500" role="alert">
        {error}
      </p>
      <Button type="submit" size="lg" className="mt-4" disabled={!valid}>
        Continue <ArrowRight weight="bold" className="size-4" aria-hidden />
      </Button>
    </form>
  );
}

/** Boot lines for ~3s while your profile is saved. */
function Boot({ name, age, onDone }: { name: string; age: number; onDone: (profile: Profile) => void }) {
  const reduced = useReducedMotion();
  const [line, setLine] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const step = (reduced ? 600 : LOADING_MS) / LOADING_LINES.length;
    const timers = LOADING_LINES.map((_, i) => setTimeout(() => !cancelled && setLine(i), i * step));
    const minWait = new Promise((r) => setTimeout(r, reduced ? 600 : LOADING_MS));
    const save = api.updateProfile({ displayName: name, age, completeOnboarding: true });

    Promise.all([save, minWait])
      .then(([{ profile }]) => !cancelled && onDone(profile))
      .catch((error: Error) => !cancelled && setFailed(error.message));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [name, age, onDone, reduced, attempt]);

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="alert">
        <WarningCircle weight="fill" className="size-10 text-red-500" aria-hidden />
        <p className="text-sm font-semibold">{failed}</p>
        <Button
          onClick={() => {
            setFailed(null);
            setLine(0);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite">
      <div className="h-1 overflow-hidden rounded-full bg-surface-hover">
        <div
          className="h-full origin-left rounded-full bg-fg transition-transform duration-700 ease-premium"
          style={{ transform: `scaleX(${(line + 1) / LOADING_LINES.length})` }}
        />
      </div>
      <ul className="flex flex-col gap-2 font-mono text-xs font-bold tracking-[0.15em] uppercase">
        {LOADING_LINES.map((text, i) => (
          <li
            key={text}
            className={i <= line ? "animate-blur-in text-fg" : "opacity-0"}
            aria-hidden={i > line}
          >
            {i < line ? "✓ " : i === line ? "› " : ""}
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
