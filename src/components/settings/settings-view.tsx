"use client";

import {
  ArrowLeft,
  Brain,
  DownloadSimple,
  FileText,
  Info,
  SignOut,
  Trash,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useId, useState } from "react";
import { signOutAction } from "@/app/app/actions";
import { Logo } from "@/components/brand/logo";
import { useTheme } from "@/components/theme/theme-provider";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { api } from "@/lib/chat/client/api";
import { useShowReasoning } from "@/lib/chat/client/use-show-reasoning";
import type { Profile } from "@/lib/chat/types";
import { site } from "@/lib/site";
import { ThemePicker } from "@/components/theme/theme-picker";
import { customThemePayload } from "@/lib/theme/palettes";
import { NameAgeFields, SwitchRow, validateProfile } from "./fields";

/** The full /settings page. Everything is saved to your account (works on every device). */
export function SettingsView({ profile, chatCount }: { profile: Profile; chatCount: number }) {
  return (
    <ToastProvider>
      <SettingsScreen initialProfile={profile} initialChatCount={chatCount} />
    </ToastProvider>
  );
}

function SettingsScreen({
  initialProfile,
  initialChatCount,
}: {
  initialProfile: Profile;
  initialChatCount: number;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [chatCount, setChatCount] = useState(initialChatCount);

  return (
    <div className="min-h-dvh pt-safe pr-safe pb-safe pl-safe">
      <header className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <ButtonLink href="/app" variant="ghost" className="px-3 whitespace-nowrap">
            <ArrowLeft weight="bold" className="size-4" aria-hidden />
            Back to chat
          </ButtonLink>
          <ThemeToggle />
        </div>
      </header>

      <main id="main" className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-20 sm:px-6">
        <div className="animate-fade-up pt-4 pb-2">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Settings</h1>
          <p className="mt-2 text-sm text-muted">
            Saved to your account, so they follow you to every device.
          </p>
        </div>

        <ProfileSection profile={profile} onSaved={setProfile} />
        <MemorySection profile={profile} onSaved={setProfile} />
        <DataSection chatCount={chatCount} onCleared={() => setChatCount(0)} />
        <AccountSection profile={profile} />
        <AboutSection />
      </main>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="animate-fade-up rounded-3xl glass-solid p-5 sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-line"
        >
          {icon}
        </span>
        <div>
          <h2 id={id} className="text-lg font-extrabold tracking-tight">
            {title}
          </h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/* ── Profile + appearance ─────────────────────────────────────────── */

function ProfileSection({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const notify = useToast();
  const { preference, paletteId, customThemes } = useTheme();
  const [name, setName] = useState(profile.displayName ?? profile.name?.split(" ")[0] ?? "");
  const [age, setAge] = useState(profile.age ? String(profile.age) : "");
  const [particles, setParticles] = useState(profile.particles);
  const [errors, setErrors] = useState<{ name?: string; age?: string }>({});
  const [saving, setSaving] = useState(false);
  const [showReasoning, setShowReasoning] = useShowReasoning();
  const ids = { name: useId(), age: useId(), particles: useId(), reasoning: useId() };

  const save = async () => {
    const nextErrors = validateProfile(name, age);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      const { profile: saved } = await api.updateProfile({
        displayName: name.trim(),
        age: Number(age),
        theme: preference,
        themePalette: paletteId,
        customThemes: customThemes.map(customThemePayload),
        particles,
      });
      onSaved(saved);
      notify("Settings saved.", "success");
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      id="settings-profile"
      title="Profile & appearance"
      description="How Proxima greets you and how it looks."
      icon={<UserCircle weight="bold" className="size-5" />}
    >
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
        <Button type="submit" size="lg" disabled={saving} className="sm:self-start">
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Section>
  );
}

/* ── Memory ───────────────────────────────────────────────────────── */

/**
 * Settings → Memory.
 *
 * OFF by default, and the switch does two separate things the person can see:
 * it shows a consent card the first time, and it is the only way memory is ever
 * written. Everything stored is listed on /settings/memory, where it can be
 * edited, deleted one by one, exported or wiped.
 */
function MemorySection({ profile, onSaved }: { profile: Profile; onSaved: (profile: Profile) => void }) {
  const notify = useToast();
  const [enabled, setEnabled] = useState(profile.memoryEnabled);
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (next: boolean) => {
    setBusy(true);
    try {
      await api.setMemoryEnabled(next);
      setEnabled(next);
      onSaved({ ...profile, memoryEnabled: next, memoryConsented: profile.memoryConsented || next });
      notify(next ? "Memory is on. You can review every note any time." : "Memory is off. New chats won't be remembered.", "success");
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      id="settings-memory"
      title="Memory"
      description={
        enabled
          ? "PROXIMA remembers durable facts you mention (goals, routines, preferences) so later answers fit you."
          : "Off. Nothing is saved or used between chats — each conversation starts fresh."
      }
      icon={<Brain weight="bold" className="size-5" />}
    >
      <SwitchRow
        id="settings-memory-switch"
        title="Remember things between chats"
        hint="Only durable facts: goals, routines, preferences. Never passwords, keys, card numbers, addresses, health details or anything about other people."
        checked={enabled}
        onChange={(next) => {
          if (next && !profile.memoryConsented) {
            setConsentOpen(true);
            return;
          }
          void save(next);
        }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <ButtonLink href="/settings/memory" variant="secondary">
          Review what&apos;s remembered
        </ButtonLink>
        <ButtonLink href="/api/memory?format=md" variant="ghost">
          <DownloadSimple weight="bold" className="size-4" aria-hidden /> Export
        </ButtonLink>
      </div>

      <p className="mt-3 text-xs text-subtle">
        Tip: the composer has a <strong>Temporary</strong> switch. With it on, that chat is not saved and
        memory is ignored either way.
      </p>

      <ConfirmDialog
        open={consentOpen}
        title="Turn memory on?"
        message="PROXIMA will keep short notes like “going to the gym” or “training for a half marathon”, and use them when they make an answer better. You can see, edit and delete every note in Settings → Memory, and turn this off at any time. Passwords, keys, card numbers, addresses, health details and details about other people are never stored."
        confirmLabel="Turn on memory"
        busy={busy}
        onCancel={() => setConsentOpen(false)}
        onConfirm={async () => {
          setConsentOpen(false);
          await save(true);
        }}
      />
    </Section>
  );
}

/* ── Your data ────────────────────────────────────────────────────── */

function DataSection({ chatCount, onCleared }: { chatCount: number; onCleared: () => void }) {
  const notify = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const empty = chatCount === 0;

  return (
    <Section
      id="settings-data"
      title="Your data"
      description={
        empty
          ? "You have no saved chats yet."
          : `You have ${chatCount} saved chat${chatCount === 1 ? "" : "s"}. Download a copy any time.`
      }
      icon={<FileText weight="bold" className="size-5" />}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href="/api/export?format=md"
          download
          aria-disabled={empty || undefined}
          className={buttonClasses(
            { variant: "secondary" },
            "flex-1 aria-disabled:pointer-events-none aria-disabled:opacity-40",
          )}
        >
          <DownloadSimple weight="bold" className="size-4" aria-hidden /> Download all (Markdown)
        </a>
        <a
          href="/api/export?format=json"
          download
          aria-disabled={empty || undefined}
          className={buttonClasses(
            { variant: "secondary" },
            "flex-1 aria-disabled:pointer-events-none aria-disabled:opacity-40",
          )}
        >
          <DownloadSimple weight="bold" className="size-4" aria-hidden /> Download all (JSON)
        </a>
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">Delete every chat. Your profile and settings stay.</p>
        <Button variant="danger" disabled={empty} onClick={() => setConfirm(true)}>
          <Trash weight="bold" className="size-4" aria-hidden /> Delete all chats
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Delete all chats?"
        message="This permanently deletes every chat in your account. Your settings are kept. This can't be undone."
        confirmLabel="Delete everything"
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            const { deleted } = await api.clearAll();
            onCleared();
            notify(`Deleted ${deleted} chat${deleted === 1 ? "" : "s"}.`, "success");
            setConfirm(false);
          } catch (error) {
            notify((error as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      />
    </Section>
  );
}

/* ── Account ──────────────────────────────────────────────────────── */

function AccountSection({ profile }: { profile: Profile }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <Section
      id="settings-account"
      title="Account"
      description="You sign in with Google."
      icon={<SignOut weight="bold" className="size-5" />}
    >
      <div className="flex items-center gap-3 rounded-2xl border border-line p-3">
        {profile.image ? (
          <Image src={profile.image} alt="" width={44} height={44} className="size-11 rounded-xl" />
        ) : (
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-xl bg-inverse font-black text-on-inverse"
          >
            {(profile.displayName ?? profile.name ?? profile.email ?? "?").charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-bold">{profile.name ?? profile.displayName ?? "Signed in"}</p>
          <p className="truncate text-sm text-muted">{profile.email}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void signOutAction();
          }}
        >
          <SignOut weight="bold" className="size-4" aria-hidden /> {signingOut ? "Signing out…" : "Sign out"}
        </Button>
        <Button variant="danger" className="flex-1" onClick={() => setDeleteOpen(true)}>
          <WarningCircle weight="bold" className="size-4" aria-hidden /> Delete account
        </Button>
      </div>

      <DeleteAccountDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </Section>
  );
}

function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete your account?"
      description="This permanently deletes your account, your profile and every chat. It can't be undone."
      className="max-w-sm"
    >
      {/* Remount each time so the box starts empty. */}
      {open && <DeleteAccountForm onClose={onClose} />}
    </Dialog>
  );
}

function DeleteAccountForm({ onClose }: { onClose: () => void }) {
  const notify = useToast();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const ready = typed.trim() === "DELETE";

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        try {
          await api.deleteAccount();
          notify("Your account was deleted. Goodbye!", "success");
          await signOutAction(); // clears the login cookie and goes to the home page
        } catch (error) {
          notify((error as Error).message, "error");
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-muted">Tip: download your chats first, under “Your data” on this page.</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-bold">
          Type <span className="font-mono">DELETE</span> to confirm
        </label>
        <input
          id={inputId}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="input font-mono"
        />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" disabled={!ready || busy}>
          {busy ? "Deleting…" : "Delete forever"}
        </Button>
      </div>
    </form>
  );
}

/* ── About ────────────────────────────────────────────────────────── */

function AboutSection() {
  return (
    <Section
      id="settings-about"
      title="About"
      description={`${site.name} ${site.version} · by ${site.developer}`}
      icon={<Info weight="bold" className="size-5" />}
    >
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-y-2">
        <dt className="font-mono text-xs leading-6 text-subtle">⌘K / Ctrl+K</dt>
        <dd className="mb-2 text-muted sm:mb-0">Open the command palette (in the chat)</dd>
        <dt className="font-mono text-xs leading-6 text-subtle">/</dt>
        <dd className="mb-2 text-muted sm:mb-0">Jump to the message box</dd>
        <dt className="font-mono text-xs leading-6 text-subtle">Ctrl/Cmd + Shift + O</dt>
        <dd className="mb-2 text-muted sm:mb-0">Start a new chat</dd>
        <dt className="font-mono text-xs leading-6 text-subtle">Enter · Shift + Enter</dt>
        <dd className="mb-2 text-muted sm:mb-0">Send · new line</dd>
      </dl>
      <nav aria-label="Legal" className="mt-5 flex flex-wrap gap-x-1 border-t border-line pt-4 text-sm">
        <Link
          href="/privacy"
          className="inline-flex tap items-center rounded-xl px-2 font-bold text-muted hover:text-fg"
        >
          Privacy Policy
        </Link>
        <Link
          href="/terms"
          className="inline-flex tap items-center rounded-xl px-2 font-bold text-muted hover:text-fg"
        >
          Terms of Use
        </Link>
        <a
          href={site.links.facebook}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex tap items-center rounded-xl px-2 font-bold text-muted hover:text-fg"
        >
          Contact the developer
        </a>
      </nav>
    </Section>
  );
}
