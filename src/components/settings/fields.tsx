"use client";

import { cn } from "@/lib/cn";

/**
 * Small form pieces shared by the Settings pop-up (in /app) and the
 * full /settings page, so both look and behave the same.
 */

export const NAME_MAX = 20;

/** Checks name + age the same way the server does. Returns friendly messages. */
export function validateProfile(name: string, age: string): { name?: string; age?: string } {
  const errors: { name?: string; age?: string } = {};
  const ageNumber = Number(age);
  if (!name.trim()) errors.name = "Please enter your name.";
  if (!/^\d+$/.test(age) || !Number.isInteger(ageNumber) || ageNumber < 1 || ageNumber > 120)
    errors.age = "Enter an age from 1 to 120.";
  return errors;
}

/** A label + input + error message, wired together for screen readers. */
export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-extrabold tracking-[0.2em] text-muted uppercase">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs font-semibold text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

/** Name + age inputs side by side. */
export function NameAgeFields({
  ids,
  name,
  age,
  errors,
  onName,
  onAge,
}: {
  ids: { name: string; age: string };
  name: string;
  age: string;
  errors: { name?: string; age?: string };
  onName: (value: string) => void;
  onAge: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_6rem] gap-3">
      <Field id={ids.name} label="Your name" error={errors.name}>
        <input
          id={ids.name}
          value={name}
          onChange={(e) => onName(e.target.value)}
          maxLength={NAME_MAX}
          autoComplete="given-name"
          aria-invalid={!!errors.name || undefined}
          aria-describedby={errors.name ? `${ids.name}-error` : undefined}
          className="input"
        />
      </Field>
      <Field id={ids.age} label="Age" error={errors.age}>
        <input
          id={ids.age}
          value={age}
          onChange={(e) => onAge(e.target.value.replace(/\D/g, "").slice(0, 3))}
          inputMode="numeric"
          aria-invalid={!!errors.age || undefined}
          aria-describedby={errors.age ? `${ids.age}-error` : undefined}
          className="input"
        />
      </Field>
    </div>
  );
}

/** An on/off switch with a title and a hint. */
export function SwitchRow({
  id,
  title,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  id: string;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-line px-4 py-3">
      <label htmlFor={id} className="text-sm">
        <span className="block font-bold">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={cn(
          "relative inline-flex tap shrink-0 items-center justify-center rounded-full",
          "before:absolute before:h-7 before:w-12 before:rounded-full before:border before:border-line before:transition-colors before:duration-300",
          "disabled:cursor-not-allowed disabled:opacity-45",
          checked ? "before:bg-inverse" : "before:bg-surface-hover",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "relative inline-block size-5 rounded-full shadow transition-transform duration-300 ease-premium",
            checked ? "translate-x-2.5 bg-on-inverse" : "-translate-x-2.5 bg-fg/60",
          )}
        />
      </button>
    </div>
  );
}
