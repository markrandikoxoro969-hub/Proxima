"use client";

import { SignOut, Trash } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { signOutAction } from "@/app/app/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useTheme } from "@/components/theme/theme-provider";
import { api } from "@/lib/chat/client/api";
import type { Profile } from "@/lib/chat/types";
import { cn } from "@/lib/cn";
import type { ThemePreference } from "@/lib/theme";

export const NAME_MAX = 20;

/**
 * Settings: name, age, theme, particles, clear history, sign out.
 * Saved to your account (works on every device), not in the browser.
 */
export function SettingsDialog({
  open,
  profile,
  onClose,
  onSaved,
  onClearAll,
  notify,
}: {
  open: boolean;
  profile: Profile;
  onClose: () => void;
  onSaved: (profile: Profile) => void;
  onClearAll: () => Promise<boolean>;
  notify: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Settings"
      description="Saved to your account on every device."
    >
      {/* Remount the form each time it opens so it shows the latest values. */}
      {open && (
        <SettingsForm
          profile={profile}
          onClose={onClose}
          onSaved={onSaved}
          onClearAll={onClearAll}
          notify={notify}
        />
      )}
    </Dialog>
  );
}

function SettingsForm({
  profile,
  onClose,
  onSaved,
  onClearAll,
  notify,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: (profile: Profile) => void;
  onClearAll: () => Promise<boolean>;
  notify: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  const { preference, setPreference } = useTheme();
  const [name, setName] = useState(profile.displayName ?? profile.name?.split(" ")[0] ?? "");
  const [age, setAge] = useState(profile.age ? String(profile.age) : "");
  const [theme, setTheme] = useState<ThemePreference>(preference);
  const [particles, setParticles] = useState(profile.particles);
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; age?: string }>({});
  const ids = { name: useId(), age: useId(), particles: useId() };

  const save = async () => {
    const ageNumber = Number(age);
    const nextErrors: typeof errors = {};
    if (!name.trim()) nextErrors.name = "Please enter your name.";
    if (!Number.isInteger(ageNumber) || ageNumber < 1 || ageNumber > 120)
      nextErrors.age = "Enter an age from 1 to 120.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      const { profile: saved } = await api.updateProfile({
        displayName: name.trim(),
        age: ageNumber,
        theme,
        particles,
      });
      setPreference(theme);
      onSaved(saved);
      notify("Settings saved.", "success");
      onClose();
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-5"
    >
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field id={ids.name} label="Your name" error={errors.name}>
          <input
            id={ids.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))}
            inputMode="numeric"
            aria-invalid={!!errors.age || undefined}
            aria-describedby={errors.age ? `${ids.age}-error` : undefined}
            className="input"
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-extrabold tracking-[0.2em] text-muted uppercase">Theme</legend>
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface-hover p-1">
          {(["dark", "light", "system"] as const).map((option) => (
            <label
              key={option}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center rounded-xl text-sm font-bold capitalize transition-[background-color,color] duration-200",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-fg",
                theme === option ? "bg-inverse text-on-inverse" : "text-muted hover:text-fg",
              )}
            >
              <input
                type="radio"
                name="theme"
                value={option}
                checked={theme === option}
                onChange={() => {
                  setTheme(option);
                  setPreference(option); // preview immediately
                }}
                className="sr-only"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-line px-4 py-3">
        <label htmlFor={ids.particles} className="text-sm">
          <span className="block font-bold">Background particles</span>
          <span className="block text-xs text-muted">Turn off to save battery.</span>
        </label>
        <button
          id={ids.particles}
          type="button"
          role="switch"
          aria-checked={particles}
          onClick={() => setParticles((v) => !v)}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-line transition-colors duration-300",
            particles ? "bg-inverse" : "bg-surface-hover",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-block size-5 rounded-full shadow transition-transform duration-300 ease-premium",
              particles ? "translate-x-6 bg-on-inverse" : "translate-x-1 bg-fg/60",
            )}
          />
        </button>
      </div>

      <Button type="submit" size="lg" disabled={saving}>
        {saving ? "Saving…" : "Save config"}
      </Button>

      <div className="flex flex-col gap-2 border-t border-line pt-5 sm:flex-row">
        <Button variant="danger" className="flex-1" onClick={() => setConfirmClear(true)}>
          <Trash weight="bold" className="size-4" aria-hidden /> Clear chat logs
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => void signOutAction()}>
          <SignOut weight="bold" className="size-4" aria-hidden /> Sign out
        </Button>
      </div>

      <p className="text-center text-[11px] text-subtle">
        Signed in as {profile.email} · Shortcuts: <kbd className="font-mono">/</kbd> focus input ·{" "}
        <kbd className="font-mono">Ctrl/Cmd Shift O</kbd> new chat
      </p>

      <ConfirmDialog
        open={confirmClear}
        title="Delete all chats?"
        message="This permanently deletes every chat in your account. Your settings are kept. This can't be undone."
        confirmLabel="Delete everything"
        busy={clearing}
        onCancel={() => setConfirmClear(false)}
        onConfirm={async () => {
          setClearing(true);
          const ok = await onClearAll();
          setClearing(false);
          setConfirmClear(false);
          if (ok) onClose();
        }}
      />
    </form>
  );
}

function Field({
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
