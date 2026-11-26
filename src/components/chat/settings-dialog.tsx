"use client";

import {
  Brain,
  Check,
  DownloadSimple,
  PencilSimple,
  SignOut,
  SlidersHorizontal,
  Sparkle,
  Trash,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { signOutAction } from "@/app/app/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useTheme } from "@/components/theme/theme-provider";
import { api } from "@/lib/chat/client/api";
import { useComposerVibes } from "@/lib/chat/client/use-composer-vibes";
import { useShowReasoning } from "@/lib/chat/client/use-show-reasoning";
import type { Profile } from "@/lib/chat/types";
import { cn } from "@/lib/cn";
import { NameAgeFields, SwitchRow, validateProfile } from "@/components/settings/fields";
import { ThemePicker } from "@/components/theme/theme-picker";
import { MAX_SELECTED_SKILLS } from "@/lib/skills/constants";
import type { SkillState } from "@/lib/skills/catalog";
import { customThemePayload } from "@/lib/theme/palettes";

export type SettingsTab = "general" | "memory" | "skills";

type Notify = (message: string, kind?: "info" | "success" | "error") => void;

type MemoryRow = {
  id: string;
  text: string;
  category: string;
  createdAt: string;
  expiresAt: string | null;
};

/**
 * Unified tabbed Settings dialog inside /app:
 *  - General: Profile, themes, vibes, particles, reasoning, clear chats, sign out.
 *  - Memory:  Toggle memory on/off, inspect, edit, export, or wipe saved notes.
 *  - Skills:  Choose up to 3 installed skills to guide every chat reply.
 */
export function SettingsDialog({
  open,
  profile,
  initialTab = "general",
  onClose,
  onSaved,
  onClearAll,
  notify,
}: {
  open: boolean;
  profile: Profile;
  initialTab?: SettingsTab;
  onClose: () => void;
  onSaved: (profile: Profile) => void;
  onClearAll: () => Promise<boolean>;
  notify: Notify;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Settings"
      description="Saved to your account on every device."
      className="max-w-2xl"
    >
      {/* Remount each time it opens so it shows the latest values. */}
      {open && (
        <SettingsTabsBody
          profile={profile}
          initialTab={initialTab}
          onClose={onClose}
          onSaved={onSaved}
          onClearAll={onClearAll}
          notify={notify}
        />
      )}
    </Dialog>
  );
}

function SettingsTabsBody({
  profile,
  initialTab,
  onClose,
  onSaved,
  onClearAll,
  notify,
}: {
  profile: Profile;
  initialTab: SettingsTab;
  onClose: () => void;
  onSaved: (profile: Profile) => void;
  onClearAll: () => Promise<boolean>;
  notify: Notify;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <SlidersHorizontal weight="bold" className="size-4" aria-hidden /> },
    { id: "memory", label: "Memory", icon: <Brain weight="bold" className="size-4" aria-hidden /> },
    { id: "skills", label: "Skills", icon: <Sparkle weight="bold" className="size-4" aria-hidden /> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Settings sections"
        className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface-hover p-1"
      >
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-extrabold tracking-wide transition-colors duration-200 sm:text-sm",
                active ? "bg-inverse text-on-inverse" : "text-muted hover:text-fg",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "general" && (
        <GeneralSettingsTab
          profile={profile}
          onClose={onClose}
          onSaved={onSaved}
          onClearAll={onClearAll}
          notify={notify}
        />
      )}
      {tab === "memory" && <MemorySettingsTab notify={notify} onClose={onClose} />}
      {tab === "skills" && <SkillsSettingsTab notify={notify} onClose={onClose} />}
    </div>
  );
}

function GeneralSettingsTab({
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
  notify: Notify;
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

function MemorySettingsTab({ notify, onClose }: { notify: Notify; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [items, setItems] = useState<MemoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const switchId = useId();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.listMemories();
        if (cancelled) return;
        setEnabled(data.enabled);
        setItems(data.memories);
      } catch (error) {
        if (!cancelled) notify((error as Error).message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify]);

  const toggleMemory = async (next: boolean) => {
    setBusy(true);
    try {
      await api.setMemoryEnabled(next);
      setEnabled(next);
      notify(next ? "Memory is on." : "Memory is off. Nothing new is saved.", "success");
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing || !editing.text.trim()) return;
    setBusy(true);
    try {
      const { memory } = await api.editMemory(editing.id, editing.text.trim());
      setItems((curr) => curr.map((item) => (item.id === memory.id ? { ...item, text: memory.text } : item)));
      setEditing(null);
      notify("Memory updated.", "success");
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const forgetOne = async (id: string) => {
    setBusy(true);
    try {
      await api.forgetMemory(id);
      setItems((curr) => curr.filter((item) => item.id !== id));
      notify("Forgotten.", "success");
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted">
        <Spinner className="size-5" label="Loading memory" />
        <span>Loading memories…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SwitchRow
        id={switchId}
        title="Remember facts between chats"
        hint="Short notes PROXIMA keeps across conversations — every note is yours to edit or delete."
        checked={enabled}
        disabled={busy}
        onChange={(next) => void toggleMemory(next)}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-extrabold tracking-[0.2em] text-muted uppercase">
          Saved notes ({items.length})
        </p>
        <div className="flex items-center gap-2">
          <a
            href="/api/memory?format=md"
            download
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[11px] font-bold text-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <DownloadSimple weight="bold" className="size-3.5" aria-hidden /> Export
          </a>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-red-500/25 px-2.5 py-1 text-[11px] font-bold text-red-500 transition-colors hover:bg-red-500/10"
            >
              <Trash weight="bold" className="size-3.5" aria-hidden /> Wipe all
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
          No saved memories yet.{enabled ? " Say “remember that …” in chat to save one." : ""}
        </p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-2xl border border-line bg-surface-hover/50 px-3 py-2.5"
            >
              {editing?.id === item.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveEdit();
                  }}
                  className="flex flex-1 items-center gap-1.5"
                >
                  <input
                    value={editing.text}
                    onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                    maxLength={240}
                    className="h-9 flex-1 rounded-xl border border-line-strong bg-surface-solid px-2.5 text-sm font-medium focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    aria-label="Save memory"
                    className="inline-flex size-9 items-center justify-center rounded-xl bg-inverse text-on-inverse"
                  >
                    <Check weight="bold" className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    aria-label="Cancel edit"
                    className="inline-flex size-9 items-center justify-center rounded-xl text-muted hover:bg-surface-hover hover:text-fg"
                  >
                    <X weight="bold" className="size-4" aria-hidden />
                  </button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.text}</p>
                    <p className="text-[10px] font-bold tracking-wider text-subtle uppercase">{item.category}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing({ id: item.id, text: item.text })}
                    aria-label="Edit memory"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-hover hover:text-fg"
                  >
                    <PencilSimple weight="bold" className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => void forgetOne(item.id)}
                    disabled={busy}
                    aria-label="Forget memory"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash weight="bold" className="size-4" aria-hidden />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end border-t border-line pt-3">
        <ButtonLink href="/settings/memory" variant="secondary" onClick={onClose}>
          Open full Memory page
        </ButtonLink>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Forget all memories?"
        message="This permanently removes every saved memory from your account. This can't be undone."
        confirmLabel="Forget everything"
        busy={busy}
        onCancel={() => setConfirmClear(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api.clearMemory();
            setItems([]);
            notify("All memories cleared.", "success");
          } catch (error) {
            notify((error as Error).message, "error");
          } finally {
            setBusy(false);
            setConfirmClear(false);
          }
        }}
      />
    </div>
  );
}

function SkillsSettingsTab({ notify, onClose }: { notify: Notify; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState<SkillState[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const idPrefix = useId();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.listSkills();
        if (!cancelled) setSkills(data.skills);
      } catch (error) {
        if (!cancelled) notify((error as Error).message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify]);

  const installed = skills.filter((skill) => skill.installed);
  const selectedCount = installed.filter((skill) => skill.enabled && skill.selected).length;

  const setSelected = async (skill: SkillState, selected: boolean) => {
    if (pendingIds.has(skill.id)) return;
    if (selected && !skill.enabled) {
      notify("Enable this skill in the Skills library first.", "info");
      return;
    }
    if (selected && selectedCount >= MAX_SELECTED_SKILLS) {
      notify(`Choose up to ${MAX_SELECTED_SKILLS} skills for chat replies.`, "info");
      return;
    }

    setPendingIds((curr) => new Set(curr).add(skill.id));
    try {
      const result = await api.updateSkill({ action: "set-selected", skillId: skill.id, selected });
      setSkills((curr) =>
        curr.map((item) => (item.id === skill.id ? { ...item, selected: result.selected } : item)),
      );
      notify(
        selected
          ? `${skill.displayName} will guide every reply.`
          : `${skill.displayName} removed from chat replies.`,
        "success",
      );
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setPendingIds((curr) => {
        const next = new Set(curr);
        next.delete(skill.id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted">
        <Spinner className="size-5" label="Loading skills" />
        <span>Loading skills…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <p>Choose up to {MAX_SELECTED_SKILLS} enabled skills to guide your chats.</p>
        <span className="rounded-full border border-line px-2.5 py-1 font-bold tabular-nums">
          {selectedCount}/{MAX_SELECTED_SKILLS} selected
        </span>
      </div>

      {installed.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
          You haven&apos;t installed any skills yet. Open the Skills library to install built-in skills.
        </p>
      ) : (
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
          {installed.map((skill) => {
            const atLimit = !skill.selected && selectedCount >= MAX_SELECTED_SKILLS;
            const disabled = !skill.enabled || pendingIds.has(skill.id) || atLimit;
            return (
              <SwitchRow
                key={skill.id}
                id={`${idPrefix}-${skill.id}`}
                title={skill.displayName}
                hint={
                  skill.enabled
                    ? `${skill.category} · ${skill.summary}`
                    : "Enable this skill in the Skills library first."
                }
                checked={skill.selected}
                disabled={disabled}
                onChange={(next) => void setSelected(skill, next)}
              />
            );
          })}
        </div>
      )}

      <div className="flex justify-end border-t border-line pt-3">
        <ButtonLink href="/skills" variant="secondary" onClick={onClose}>
          Browse Skills library
        </ButtonLink>
      </div>
    </div>
  );
}
