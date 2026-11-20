import { json, readJson, withApi } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
import { db } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { normalizeCustomThemes } from "@/lib/theme/palettes";
import { accountDeleteSchema, profileUpdateSchema } from "@/lib/validation";

/**
 * /api/me — your PROXIMA profile (replaces the old localStorage "user" object).
 *   GET    { displayName, age, theme, particles, onboarded, … }
 *   PATCH  { displayName?, age?, theme?, particles?, completeOnboarding? }
 *   DELETE { confirm: "DELETE" }  → deletes your account and ALL your chats, forever
 */
const profileSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  displayName: true,
  age: true,
  theme: true,
  themePalette: true,
  customThemes: true,
  particles: true,
  memoryEnabled: true,
  memoryConsentAt: true,
  onboardedAt: true,
} as const;

type ProfileRow = { onboardedAt: Date | null; customThemes: unknown } & Record<string, unknown>;
const toProfile = ({ onboardedAt, customThemes, memoryConsentAt, ...rest }: ProfileRow) => ({
  ...rest,
  memoryConsented: memoryConsentAt instanceof Date,
  customThemes: normalizeCustomThemes(customThemes),
  onboarded: onboardedAt !== null,
});

export const GET = withApi(async () => {
  const userId = await requireApiUserId();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: profileSelect });
  return json({ profile: toProfile(user) });
});

export const PATCH = withApi(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  await enforceRateLimit(`api:user:${userId}`, RATE_LIMITS.api);
  const { completeOnboarding, customThemes, ...fields } = profileUpdateSchema.parse(await readJson(request));

  const user = await db.user.update({
    where: { id: userId },
    data: {
      ...fields,
      // Rebuild every colour from the three the person picked (never trust the browser).
      ...(customThemes ? { customThemes: normalizeCustomThemes(customThemes) } : {}),
      ...(completeOnboarding ? { onboardedAt: new Date() } : {}),
    },
    select: profileSelect,
  });
  return json({ profile: toProfile(user) });
});

export const DELETE = withApi(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  await enforceRateLimit(`api:user:${userId}`, RATE_LIMITS.api);
  accountDeleteSchema.parse(await readJson(request));

  // The database removes everything that belongs to the user with it
  // (Google link, chats, messages) — see "onDelete: Cascade" in prisma/schema.prisma.
  await db.user.delete({ where: { id: userId } });
  return json({ deleted: true });
});
