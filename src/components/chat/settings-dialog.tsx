"use client";

import { SignOut, Trash } from "@phosphor-icons/react";
import Link from "next/link";
import { useId, useState } from "react";
import { signOutAction } from "@/app/app/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useTheme } from "@/components/theme/theme-provider";
import { api } from "@/lib/chat/client/api";
import { useComposerVibes } from "@/lib/chat/client/use-composer-vibes";
import { useShowReasoning } from "@/lib/chat/client/use-show-reasoning";
import type { Profile } from "@/lib/chat/types";
import { NameAgeFields, SwitchRow, validateProfile } from "@/components/settings/fields";
import { ThemePicker } from "@/components/theme/theme-picker";
import { customThemePayload } from "@/lib/theme/palettes";

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
  const { preference, paletteId, customThemes } = useTheme();
  const [name, setName] = useState(profile.displayName ?? profile.name?.split(" ")[0] ?? "");
  const [age, setAge] = useState(profile.age ? String(profile.age) : "");
  const [particles, setParticles] = useState(profile.particles);
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; age?: string }>({});
  const [showReasoning, setShowReasoning] = useShowReasoning();
  const [vibes, setVibes] = useComposerVibes();
  const ids = {
    name: useId(),
    age: useId(),
    particles: useId(),
    reasoning: useId(),
    memes: useId(),
    peeker: useId(),
  };

  const save = async () => {
    const ageNumber = Number(age);
    const nextErrors = validateProfile(name, age);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      const { profile: saved } = await api.updateProfile({
        displayName: name.trim(),
        age: ageNumber,
        // The picker already applied (and saved) these; sending them keeps one source of truth.
        theme: preference,
        themePalette: paletteId,
        customThemes: customThemes.map(customThemePayload),
        particles,
      });
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
      <NameAgeFields ids={ids} name={name} age={age} errors={errors} onName={setName} onAge={setAge} />

      <ThemePicker notify={notify} />

      <SwitchRow
        id={ids.memes}
        title="Typing-box memes"
        hint="Pop reactive memes on the chat box when you type slang like bruh, cooked, wasted, or rip."
        checked={vibes.memesEnabled}
        onChange={(memesEnabled) => setVibes({ memesEnabled })}
      />

      <SwitchRow
        id={ids.peeker}
        title="Peeking companion"
        hint="Keep the cute anime companion peeking from the edge of your typing box."
        checked={vibes.peekerEnabled}
        onChange={(peekerEnabled) => setVibes({ peekerEnabled })}
      />

      <SwitchRow
        id={ids.particles}
        title="Background particles"
        hint="Turn off to save battery."
        checked={particles}
        onChange={setParticles}
      />

      <SwitchRow
        id={ids.reasoning}
        title="Show reasoning"
        hint="Reveal the model's private thinking in a collapsed block. Off by default; never saved."
        checked={showReasoning}
        onChange={setShowReasoning}
      />

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
        Signed in as {profile.email} ·{" "}
        <Link href="/settings" className="font-bold text-muted underline underline-offset-2 hover:text-fg">
          All settings
        </Link>{" "}
        (download your data, delete account)
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
