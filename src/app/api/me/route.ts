import { json, readJson, withApi } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
import { db } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { profileUpdateSchema } from "@/lib/validation";

/**
 * /api/me — your PROXIMA profile (replaces the old localStorage "user" object).
 *   GET    { displayName, age, theme, particles, onboarded, … }
 *   PATCH  { displayName?, age?, theme?, particles?, completeOnboarding? }
 */
const profileSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  displayName: true,
  age: true,
  theme: true,
  particles: true,
  onboardedAt: true,
} as const;

type ProfileRow = { onboardedAt: Date | null } & Record<string, unknown>;
const toProfile = ({ onboardedAt, ...rest }: ProfileRow) => ({ ...rest, onboarded: onboardedAt !== null });

export const GET = withApi(async () => {
  const userId = await requireApiUserId();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: profileSelect });
  return json({ profile: toProfile(user) });
});

export const PATCH = withApi(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  await enforceRateLimit(`api:user:${userId}`, RATE_LIMITS.api);
  const { completeOnboarding, ...fields } = profileUpdateSchema.parse(await readJson(request));

  const user = await db.user.update({
    where: { id: userId },
    data: { ...fields, ...(completeOnboarding ? { onboardedAt: new Date() } : {}) },
    select: profileSelect,
  });
  return json({ profile: toProfile(user) });
});
