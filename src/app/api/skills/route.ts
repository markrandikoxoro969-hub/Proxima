import { apiErrors, json, readJson, withApi } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
import { db } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { buildSkillState } from "@/lib/skills/catalog";
import { MAX_SELECTED_SKILLS } from "@/lib/skills/constants";
import { skillMutationSchema } from "@/lib/skills/validation";

/**
 * GET  /api/skills — app-owned catalog plus this account's install/selection state.
 * POST /api/skills — install, uninstall, enable/disable, or select a catalog skill for Settings.
 *
 * Skill instructions are not sent here. They stay in the server registry and
 * are resolved again at chat time, after checking ownership, enabled, and selected state.
 */
export const GET = withApi(async () => {
  const userId = await requireApiUserId();
  const installed = await db.userSkill.findMany({
    where: { userId },
    select: { skillId: true, enabled: true, selected: true },
  });
  return json({ skills: buildSkillState(installed) });
});

export const POST = withApi(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  await enforceRateLimit(`api:user:${userId}`, RATE_LIMITS.api);
  const input = skillMutationSchema.parse(await readJson(request));

  if (input.action === "install") {
    const install = await db.userSkill.upsert({
      where: { userId_skillId: { userId, skillId: input.skillId } },
      create: { userId, skillId: input.skillId, enabled: true, selected: false },
      // Installing twice is idempotent and does not silently re-enable a skill.
      update: {},
      select: { skillId: true, enabled: true, selected: true },
    });
    return json({
      skillId: install.skillId,
      installed: true,
      enabled: install.enabled,
      selected: install.selected,
    });
  }

  if (input.action === "uninstall") {
    await db.userSkill.deleteMany({ where: { userId, skillId: input.skillId } });
    return json({ skillId: input.skillId, installed: false, enabled: false, selected: false });
  }

  if (input.action === "set-enabled") {
    const { count } = await db.userSkill.updateMany({
      where: { userId, skillId: input.skillId },
      data: { enabled: input.enabled, ...(!input.enabled ? { selected: false } : {}) },
    });
    if (!count) throw apiErrors.notFound("That skill is not installed");
    const skill = await db.userSkill.findUniqueOrThrow({
      where: { userId_skillId: { userId, skillId: input.skillId } },
      select: { skillId: true, enabled: true, selected: true },
    });
    return json({
      skillId: skill.skillId,
      installed: true,
      enabled: skill.enabled,
      selected: skill.selected,
    });
  }

  const skill = await db.userSkill.findUnique({
    where: { userId_skillId: { userId, skillId: input.skillId } },
    select: { enabled: true, selected: true },
  });
  if (!skill) throw apiErrors.notFound("That skill is not installed");
  if (input.selected && !skill.enabled) {
    throw apiErrors.badRequest("Enable this skill in the Skills library before selecting it for chat.");
  }
  if (input.selected && !skill.selected) {
    const selectedCount = await db.userSkill.count({ where: { userId, enabled: true, selected: true } });
    if (selectedCount >= MAX_SELECTED_SKILLS) {
      throw apiErrors.badRequest(`You can select up to ${MAX_SELECTED_SKILLS} skills in Settings.`);
    }
  }
  const updated = await db.userSkill.update({
    where: { userId_skillId: { userId, skillId: input.skillId } },
    data: { selected: input.selected },
    select: { skillId: true, enabled: true, selected: true },
  });
  return json({
    skillId: updated.skillId,
    installed: true,
    enabled: updated.enabled,
    selected: updated.selected,
  });
});
