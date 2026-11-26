"use client";

import {
  ArrowLeft,
  Check,
  GearSix,
  MagnifyingGlass,
  ShieldCheck,
  Sparkle,
  XCircle,
} from "@phosphor-icons/react";
import { useId, useMemo, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { api } from "@/lib/chat/client/api";
import { cn } from "@/lib/cn";
import type { SkillCategory, SkillState } from "@/lib/skills/catalog";
import type { SkillMutation } from "@/lib/skills/validation";

export function SkillsMarketplace({ initialSkills }: { initialSkills: SkillState[] }) {
  return (
    <ToastProvider>
      <SkillsScreen initialSkills={initialSkills} />
    </ToastProvider>
  );
}

function SkillsScreen({ initialSkills }: { initialSkills: SkillState[] }) {
  const notify = useToast();
  const searchId = useId();
  const [skills, setSkills] = useState(initialSkills);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<SkillCategory | "All skills">("All skills");
  const [view, setView] = useState<"discover" | "installed">("discover");
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  const installedCount = skills.filter((skill) => skill.installed).length;
  const enabledCount = skills.filter((skill) => skill.installed && skill.enabled).length;
  const categoryOptions = useMemo<Array<"All skills" | SkillCategory>>(
    () => ["All skills", ...new Set(skills.map((skill) => skill.category))],
    [skills],
  );
  const filteredSkills = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return skills.filter((skill) => {
      if (view === "installed" && !skill.installed) return false;
      if (category !== "All skills" && skill.category !== category) return false;
      if (!query) return true;
      const haystack = [
        skill.displayName,
        skill.name,
        skill.category,
        skill.description,
        skill.summary,
        skill.compatibility,
        ...skill.permissions,
        ...skill.whatItDoes,
      ]
        .join(" ")
        .toLocaleLowerCase();
      return haystack.includes(query);
    });
  }, [category, search, skills, view]);

  const mutate = async (input: SkillMutation) => {
    setPendingIds((current) => new Set(current).add(input.skillId));
    try {
      const result = await api.updateSkill(input);
      setSkills((current) =>
        current.map((skill) =>
          skill.id === result.skillId
            ? { ...skill, installed: result.installed, enabled: result.enabled, selected: result.selected }
            : skill,
        ),
      );
      const skill = skills.find((entry) => entry.id === input.skillId);
      const name = skill?.displayName ?? "Skill";
      if (input.action === "install") {
        notify(
          result.enabled
            ? `${name} installed and enabled. Choose it in Settings to use it in replies.`
            : `${name} is installed but remains disabled. Turn it on when you're ready.`,
          result.enabled ? "success" : "info",
        );
      } else if (input.action === "uninstall") notify(`${name} uninstalled.`, "success");
      else if (input.action === "set-enabled") {
        notify(
          input.enabled
            ? `${name} enabled. Choose it in Settings to use it in replies.`
            : `${name} disabled and removed from chat selections.`,
          "success",
        );
      } else {
        notify(`${name} ${input.selected ? "selected for" : "removed from"} chat replies.`, "success");
      }
    } catch (error) {
      notify((error as Error).message || "Could not update this skill.", "error");
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(input.skillId);
        return next;
      });
    }
  };

  return (
    <div className="px-safe min-h-dvh pt-safe pb-safe">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-4 sm:px-6">
        <Logo href="/app" />
        <nav aria-label="Account navigation" className="flex shrink-0 items-center gap-1">
          <ButtonLink
            href="/settings#settings-skills"
            variant="ghost"
            className="shrink-0 px-2 text-xs sm:px-3 sm:text-sm"
            aria-label="Choose skills in Settings"
          >
            <GearSix weight="bold" className="size-4" aria-hidden />
            <span className="hidden min-[480px]:inline">Settings</span>
          </ButtonLink>
          <ButtonLink
            href="/app"
            variant="secondary"
            className="shrink-0 px-2 text-xs sm:px-3 sm:text-sm"
            aria-label="Back to chat"
          >
            <ArrowLeft weight="bold" className="size-4" aria-hidden />
            <span className="hidden min-[480px]:inline">Back to chat</span>
          </ButtonLink>
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pt-5 pb-16 sm:px-6 sm:pt-10">
        <section aria-labelledby="skills-heading" className="mb-8 border-b border-line pb-7 sm:mb-9 sm:pb-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 text-[11px] font-extrabold tracking-[0.2em] text-[var(--accent-text)] uppercase">
                <Sparkle weight="fill" className="size-4" aria-hidden />
                PROXIMA · SKILLS
              </p>
              <h1 id="skills-heading" className="text-3xl font-black tracking-tight sm:text-4xl">
                A little more focused.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
                Install and enable skills here, then choose up to three in Settings. Your selections guide
                every new reply.
              </p>
            </div>
            <div
              className="flex shrink-0 items-center gap-2 text-xs font-semibold text-muted"
              aria-label={`${installedCount} installed, ${enabledCount} enabled`}
            >
              <span className="glass-pill rounded-xl px-3 py-2">
                <strong className="text-fg">{installedCount}</strong> installed
              </span>
              <span className="glass-pill rounded-xl px-3 py-2">
                <strong className="text-fg">{enabledCount}</strong> enabled
              </span>
            </div>
          </div>
        </section>

        <section aria-label="Browse skills">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div
              className="glass-card flex gap-1 rounded-2xl p-1"
              role="tablist"
              aria-label="Skills view"
            >
              <button
                type="button"
                role="tab"
                aria-selected={view === "discover"}
                onClick={() => setView("discover")}
                className={cn(
                  "min-h-10 rounded-xl px-4 text-xs font-extrabold transition-colors",
                  view === "discover" ? "bg-surface-solid text-fg shadow-sm" : "text-muted hover:text-fg",
                )}
              >
                Discover
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "installed"}
                onClick={() => setView("installed")}
                className={cn(
                  "min-h-10 rounded-xl px-4 text-xs font-extrabold transition-colors",
                  view === "installed" ? "bg-surface-solid text-fg shadow-sm" : "text-muted hover:text-fg",
                )}
              >
                Installed <span className="ml-1 tabular-nums">{installedCount}</span>
              </button>
            </div>

            <label htmlFor={searchId} className="relative block w-full lg:max-w-sm">
              <MagnifyingGlass
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle"
                aria-hidden
              />
              <input
                id={searchId}
                type="search"
                aria-label="Search skills or capabilities"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search skills or capabilities"
                className="input glass-input pl-10"
              />
            </label>
          </div>

          <div className="mt-4 overflow-x-auto pb-1" aria-label="Filter by category">
            <div className="flex w-max min-w-full gap-2" role="group" aria-label="Skill categories">
              {categoryOptions.map((item) => {
                const active = item === category;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(item)}
                    className={cn(
                      "min-h-9 shrink-0 rounded-full border px-3 text-[11px] font-bold transition-colors",
                      active
                        ? "border-fg bg-inverse text-on-inverse"
                        : "border-line text-muted hover:border-line-strong hover:bg-surface-hover hover:text-fg",
                    )}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            Showing {filteredSkills.length} {filteredSkills.length === 1 ? "skill" : "skills"}.
          </p>

          {filteredSkills.length ? (
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredSkills.map((skill) => (
                <SkillCard key={skill.id} skill={skill} busy={pendingIds.has(skill.id)} onMutate={mutate} />
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-line px-5 py-12 text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-xl border border-line bg-surface-hover text-muted">
                <MagnifyingGlass className="size-5" aria-hidden />
              </span>
              <h2 className="mt-4 text-base font-extrabold">
                {view === "installed" ? "No installed skills match" : "No skills found"}
              </h2>
              <p className="mt-1 text-sm text-muted">Try another search or category.</p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategory("All skills");
                  if (view === "installed" && installedCount === 0) setView("discover");
                }}
                className="mt-4 rounded-lg px-3 py-2 text-xs font-bold text-muted underline underline-offset-4 hover:text-fg"
              >
                Clear filters
              </button>
            </div>
          )}
        </section>

        <aside className="glass-card mt-8 flex items-start gap-3 rounded-2xl p-4 sm:mt-10">
          <ShieldCheck
            weight="duotone"
            className="mt-0.5 size-5 shrink-0 text-[var(--accent-text)]"
            aria-hidden
          />
          <div>
            <h2 className="text-sm font-extrabold">Built-in, permission-limited skills</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
              Skills add trusted instructions to replies only after you install and enable them, then select
              them in Settings. Up to three selected skills apply automatically to every new reply. They do
              not download or run code, browse the web, or access anything beyond the conversation and
              attachments described on each skill.
            </p>
          </div>
        </aside>

        <footer className="mt-8 border-t border-line pt-5 text-center text-[11px] text-subtle">
          Skill instructions stay in PROXIMA&apos;s app-owned catalog. No external skill links or unverified
          sources are loaded.
        </footer>
      </main>
    </div>
  );
}

function SkillCard({
  skill,
  busy,
  onMutate,
}: {
  skill: SkillState;
  busy: boolean;
  onMutate: (input: SkillMutation) => Promise<void>;
}) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      className="glass-card flex min-w-0 flex-col rounded-2xl p-4 transition-[border-color,background-color,transform] duration-200 hover:border-line-strong sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-hover text-[var(--accent-text)]">
          <Sparkle weight="duotone" className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-[10px] font-bold tracking-[0.14em] text-subtle uppercase">
            {skill.category}
          </p>
          <h2 id={titleId} className="mt-1 text-base font-extrabold tracking-tight">
            {skill.displayName}
          </h2>
        </div>
        {skill.installed && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-1 text-[10px] font-bold",
              skill.selected ? "text-[var(--accent-text)]" : "text-muted",
            )}
          >
            <Check weight="bold" className="size-3 text-emerald-500" aria-hidden />
            {skill.selected ? "Selected in Settings" : "Installed"}
          </span>
        )}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">{skill.description}</p>
      <p className="mt-2 text-xs leading-relaxed font-semibold text-fg">{skill.summary}</p>
      <p className="mt-3 text-[10px] leading-relaxed text-subtle">
        <span className="font-extrabold">Access:</span> {skill.permissions.join(" · ")} · No executable tools
      </p>

      <div className="mt-4 flex-1">
        <p className="text-[10px] font-extrabold tracking-[0.14em] text-subtle uppercase">What it does</p>
        <ul className="mt-2 space-y-1.5">
          {skill.whatItDoes.map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs leading-relaxed text-muted">
              <span
                aria-hidden
                className="mt-[0.42rem] size-1 shrink-0 rounded-full bg-[var(--accent-text)]"
              />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <details className="group mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer list-none text-xs font-bold text-muted transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck weight="bold" className="size-4" aria-hidden />
            Permissions & compatibility
            <span aria-hidden className="ml-auto text-subtle transition-transform group-open:rotate-180">
              ⌄
            </span>
          </span>
        </summary>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">{skill.compatibility}</p>
        <ul className="mt-2 space-y-1">
          {skill.permissions.map((permission) => (
            <li key={permission} className="flex items-center gap-2 text-[11px] text-subtle">
              <Check weight="bold" className="size-3.5 text-emerald-500" aria-hidden /> {permission}
            </li>
          ))}
          <li className="flex items-center gap-2 text-[11px] text-subtle">
            <XCircle weight="bold" className="size-3.5 text-subtle" aria-hidden /> No executable tools
          </li>
        </ul>
      </details>

      {skill.installed ? (
        <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
          <button
            type="button"
            role="switch"
            aria-checked={skill.enabled}
            aria-label={`${skill.enabled ? "Disable" : "Enable"} ${skill.displayName}`}
            disabled={busy}
            onClick={() =>
              void onMutate({ action: "set-enabled", skillId: skill.id, enabled: !skill.enabled })
            }
            className="group/switch flex min-h-10 flex-1 items-center gap-2 text-left text-xs font-bold text-muted disabled:opacity-50"
          >
            <span
              className={cn(
                "relative h-5 w-9 rounded-full border border-line transition-colors",
                skill.enabled ? "bg-[var(--accent)]/70" : "bg-surface-hover",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 size-3.5 rounded-full bg-surface-solid shadow transition-transform",
                  skill.enabled && "translate-x-4",
                )}
              />
            </span>
            {skill.enabled ? "Enabled" : "Disabled"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onMutate({ action: "uninstall", skillId: skill.id })}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-subtle transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
          >
            {busy ? (
              <span
                className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
                aria-hidden
              />
            ) : (
              <XCircle weight="bold" className="size-4" aria-hidden />
            )}
            Uninstall
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onMutate({ action: "install", skillId: skill.id })}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-inverse px-4 text-xs font-extrabold text-on-inverse transition-[opacity,transform] hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? (
            <span
              className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
              aria-hidden
            />
          ) : (
            <Sparkle weight="fill" className="size-4" aria-hidden />
          )}
          {busy ? "Updating…" : "Install skill"}
        </button>
      )}
    </article>
  );
}
