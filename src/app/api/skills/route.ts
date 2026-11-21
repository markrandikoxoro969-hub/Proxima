import { apiErrors, json, readJson, withApi } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
import { db } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { buildSkillState } from "@/lib/skills/catalog";
import { skillMutationSchema } from "@/lib/skills/validation";

/**
 * GET  /api/skills — app-owned catalog plus this account's install state.
 * POST /api/skills — install, uninstall, or enable/disable one catalog skill.
 *
 * Skill instructions are not sent here. They stay in the server registry and
 * are resolved again at chat time, after checking the user's installation.
 */
export const GET = withApi(async () => {
  const userId = await requireApiUserId();
  const installed = await db.userSkill.findMany({
    where: { userId },
    select: { skillId: true, enabled: true },
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
      create: { userId, skillId: input.skillId, enabled: true },
      // Installing twice is idempotent and does not silently re-enable a skill.
      update: {},
      select: { skillId: true, enabled: true },
    });
    return json({ skillId: install.skillId, installed: true, enabled: install.enabled });
  }

  if (input.action === "uninstall") {
    await db.userSkill.deleteMany({ where: { userId, skillId: input.skillId } });
    return json({ skillId: input.skillId, installed: false, enabled: false });
  }

  const { count } = await db.userSkill.updateMany({
    where: { userId, skillId: input.skillId },
    data: { enabled: input.enabled },
  });
  if (!count) throw apiErrors.notFound("That skill is not installed");
  return json({ skillId: input.skillId, installed: true, enabled: input.enabled });
});
