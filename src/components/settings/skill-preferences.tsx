"use client";

import { Sparkle } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/chat/client/api";
import { MAX_SELECTED_SKILLS } from "@/lib/skills/constants";
import type { SkillState } from "@/lib/skills/catalog";
import { SwitchRow } from "./fields";

/** Persistent default chat-skill selection, managed from Settings. */
export function SkillPreferences({ initialSkills }: { initialSkills: SkillState[] }) {
  const notify = useToast();
  const idPrefix = useId();
  const [skills, setSkills] = useState(initialSkills);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  const installed = skills.filter((skill) => skill.installed);
  const selectedCount = installed.filter((skill) => skill.enabled && skill.selected).length;
  const addingSelection = installed.some((skill) => pendingIds.has(skill.id) && !skill.selected);

  const setSelected = async (skill: SkillState, selected: boolean) => {
    if (pendingIds.has(skill.id)) return;
    if (selected && !skill.enabled) {
      notify("Enable this skill in the Skills library before selecting it for chat.", "info");
      return;
    }
    if (selected && selectedCount >= MAX_SELECTED_SKILLS) {
      notify(`Choose up to ${MAX_SELECTED_SKILLS} skills for chat replies.`, "info");
      return;
    }

    setPendingIds((current) => new Set(current).add(skill.id));
    try {
      const result = await api.updateSkill({ action: "set-selected", skillId: skill.id, selected });
      setSkills((current) =>
        current.map((item) => (item.id === skill.id ? { ...item, selected: result.selected } : item)),
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
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(skill.id);
        return next;
      });
    }
  };

  return (
    <section
      id="settings-skills"
      aria-labelledby="settings-skills-heading"
      className="animate-fade-up scroll-mt-6 rounded-3xl glass-solid p-5 sm:p-7"
    >
      <div className="mb-5 flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-line"
        >
          <Sparkle weight="bold" className="size-5" />
        </span>
        <div>
          <h2 id="settings-skills-heading" className="text-lg font-extrabold tracking-tight">
            Skills for every reply
          </h2>
          <p className="text-sm text-muted">Choose up to three enabled skills to guide your chats.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <p>These settings apply automatically to new replies on every device.</p>
        <span
          className="rounded-full border border-line px-2.5 py-1 font-bold tabular-nums"
          aria-live="polite"
        >
          {selectedCount}/{MAX_SELECTED_SKILLS} selected
        </span>
      </div>

      {installed.length ? (
        <div className="flex flex-col gap-2">
          {installed.map((skill) => {
            const atLimit = !skill.selected && selectedCount >= MAX_SELECTED_SKILLS;
            const disabled =
              !skill.enabled ||
              pendingIds.has(skill.id) ||
              atLimit ||
              (addingSelection && !skill.selected);
            return (
              <SwitchRow
                key={skill.id}
                id={`${idPrefix}-${skill.id}`}
                title={skill.displayName}
                hint={
                  skill.enabled
                    ? `${skill.category} · ${skill.summary}`
                    : "Enable this installed skill in the Skills library before selecting it."
                }
                checked={skill.selected}
                disabled={disabled}
                onChange={(next) => void setSelected(skill, next)}
              />
            );
          })}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm leading-relaxed text-muted">
          You haven&apos;t installed any skills yet. Browse the built-in library to add skills you&apos;d like
          to use.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="max-w-md text-xs leading-relaxed text-subtle">
          Only app-owned skills that are installed, enabled, and selected here can guide a reply.
        </p>
        <ButtonLink href="/skills" variant="secondary" className="shrink-0">
          Browse skills
        </ButtonLink>
      </div>
    </section>
  );
}
