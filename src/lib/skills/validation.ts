import { z } from "zod";
import { MAX_SELECTED_SKILLS } from "./constants";
import { SKILL_IDS } from "./catalog";

export const skillSelectionSchema = z
  .array(z.enum(SKILL_IDS))
  .max(MAX_SELECTED_SKILLS, `Choose up to ${MAX_SELECTED_SKILLS} skills in Settings.`)
  .refine((ids) => new Set(ids).size === ids.length, "A skill can only be selected once.");

export const skillMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("install"), skillId: z.enum(SKILL_IDS) }),
  z.object({ action: z.literal("uninstall"), skillId: z.enum(SKILL_IDS) }),
  z.object({ action: z.literal("set-enabled"), skillId: z.enum(SKILL_IDS), enabled: z.boolean() }),
  z.object({ action: z.literal("set-selected"), skillId: z.enum(SKILL_IDS), selected: z.boolean() }),
]);

export type SkillMutation = z.infer<typeof skillMutationSchema>;
