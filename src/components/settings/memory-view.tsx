"use client";

import { ArrowLeft, Brain, Check, DownloadSimple, PencilSimple, Trash, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/chat/client/api";

export type MemoryItem = {
  id: string;
  text: string;
  category: string;
  createdAt: string;
  expiresAt: string | null;
};

const date = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * The list behind Settings → Memory.
 *
 * Everything here is the person's own data: they can fix a note in place (the
 * model never gets to rewrite their words), delete one, wipe the lot, or take a
 * copy out. Memory has to feel this boring to be trustworthy.
 */
export function MemoryView({ enabled, consented, memories }: { enabled: boolean; consented: boolean; memories: MemoryItem[] }) {
  const notify = useToast();
  const [items, setItems] = useState(memories);
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [hasConsent, setHasConsent] = useState(consented);
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const remove = async (item: MemoryItem) => {
    setBusy(true);
    try {
      await api.forgetMemory(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      notify("Forgotten.", "success");
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const { memory } = await api.editMemory(editing.id, editing.text.trim());
      setItems((current) =>
        current.map((entry) => (entry.id === memory.id ? { ...entry, text: memory.text } : entry)),
      );
      setEditing(null);
      notify("Updated.", "success");
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      await api.setMemoryEnabled(next);
      setIsEnabled(next);
      if (next) setHasConsent(true);
      notify(next ? "Memory is on." : "Memory is off. Nothing new is saved.", "success");
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh pt-safe pr-safe pb-safe pl-safe">
      <header className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <ButtonLink href="/settings" variant="ghost" className="px-3 whitespace-nowrap">
            <ArrowLeft weight="bold" className="size-4" aria-hidden /> Settings
          </ButtonLink>
          <ThemeToggle />
        </div>
      </header>

      <main id="main" className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-20 sm:px-6">
        <div className="animate-fade-up pt-4 pb-2">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Memory</h1>
          <p className="mt-2 text-sm text-muted">
            Short notes PROXIMA keeps between chats — and every one of them is yours to change.
          </p>
        </div>

        <section className="rounded-3xl glass-solid p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold">
                Memory is {isEnabled ? "on" : "off"}
                {isEnabled ? <Check weight="bold" className="ml-1.5 inline size-4 text-[var(--accent-text)]" /> : null}
              </p>
              <p className="mt-1 max-w-md text-xs text-subtle">
                Off means nothing is read and nothing is saved. Existing notes are kept until you delete them.
              </p>
            </div>
            <Button
              variant={isEnabled ? "secondary" : "primary"}
              disabled={busy}
              onClick={() => {
                if (!isEnabled && !hasConsent) setConfirmEnable(true);
                else void toggle(!isEnabled);
              }}
            >
              <Brain weight="bold" className="size-4" aria-hidden />
              {isEnabled ? "Turn off" : "Turn on"}
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <a href="/api/memory?format=md" download className="text-xs font-bold text-muted hover:text-fg">
              <DownloadSimple weight="bold" className="mr-1 inline size-3.5" aria-hidden /> Export as Markdown
            </a>
            <a href="/api/memory?format=json" download className="text-xs font-bold text-muted hover:text-fg">
              <DownloadSimple weight="bold" className="mr-1 inline size-3.5" aria-hidden /> Export as JSON
            </a>
          </div>
        </section>

        <section className="rounded-3xl glass-solid p-5 sm:p-7">
          <h2 className="text-lg font-black tracking-tight">What&apos;s remembered</h2>

          {items.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Nothing yet. Say something like “I&apos;m training for a half marathon” in a chat with memory on and
              it will appear here.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col divide-y divide-line">
              {items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 py-3">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <div className="min-w-0 flex-1">
                    {editing?.id === item.id ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveEdit();
                        }}
                        className="flex flex-col gap-2 sm:flex-row"
                      >
                        <input
                          value={editing.text}
                          onChange={(event) => setEditing({ id: item.id, text: event.target.value })}
                          maxLength={240}
                          autoFocus
                          aria-label="Memory text"
                          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
                        />
                        <div className="flex gap-1">
                          <Button type="submit" size="icon" variant="secondary" disabled={busy} aria-label="Save">
                            <Check weight="bold" className="size-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditing(null)}
                            aria-label="Cancel"
                          >
                            <X weight="bold" className="size-4" aria-hidden />
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <p className="text-sm leading-relaxed text-fg selectable">{item.text}</p>
                    )}
                    <p className="mt-1 text-[11px] font-semibold text-subtle">
                      {item.category} · added {date(item.createdAt)}
                      {item.expiresAt ? ` · expires ${date(item.expiresAt)}` : ""}
                    </p>
                  </div>
                  {editing?.id !== item.id && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing({ id: item.id, text: item.text })}
                        aria-label={`Edit memory: ${item.text}`}
                      >
                        <PencilSimple weight="bold" className="size-4" aria-hidden />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void remove(item)}
                        aria-label={`Forget memory: ${item.text}`}
                      >
                        <Trash weight="bold" className="size-4" aria-hidden />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <div className="mt-5 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">Start over: this deletes every note above.</p>
              <Button variant="danger" disabled={busy} onClick={() => setConfirmAll(true)}>
                <Trash weight="bold" className="size-4" aria-hidden /> Delete all memories
              </Button>
            </div>
          )}
        </section>

        <p className="px-1 text-xs text-subtle">
          Memories are never used to train a model and never shared.{" "}
          <Link href="/privacy" className="font-bold underline underline-offset-2 hover:text-fg">
            How memory fits the privacy policy
          </Link>
          .
        </p>
      </main>

      <ConfirmDialog
        open={confirmEnable}
        title="Turn memory on?"
        message="PROXIMA will keep short notes like goals, routines and preferences, and use them only when they make a reply better. Review, edit or delete any note at Settings → Memory. Passwords, keys, card or ID numbers, exact addresses, health diagnoses and details about other people are not stored unless you explicitly ask PROXIMA to remember them. You can turn memory off at any time."
        confirmLabel="Turn on memory"
        busy={busy}
        onCancel={() => setConfirmEnable(false)}
        onConfirm={async () => {
          setConfirmEnable(false);
          await toggle(true);
        }}
      />
      <ConfirmDialog
        open={confirmAll}
        title="Delete every memory?"
        message="PROXIMA will forget everything above. Your chats are not deleted. This can't be undone."
        confirmLabel="Delete all"
        busy={busy}
        onCancel={() => setConfirmAll(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api.clearMemory();
            setItems([]);
            setConfirmAll(false);
            notify("All memories deleted.", "success");
          } catch (error) {
            notify((error as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
