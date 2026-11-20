import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import type { Profile } from "@/lib/chat/types";
import { db } from "@/lib/db";
import { normalizeCustomThemes } from "@/lib/theme/palettes";

/**
 * "Data access layer" for the signed-in user.
 * Every page/API that needs the user goes through here, so the security
 * check lives in ONE place. `cache` means multiple calls in one request
 * only hit the database once.
 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  return db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      displayName: true,
      age: true,
      onboardedAt: true,
      theme: true,
      themePalette: true,
      customThemes: true,
      particles: true,
      memoryNotes: true,
    },
  });
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** For pages: returns the user, or sends them to /login (then back here). */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
  return user;
}

/** The safe, browser-ready version of the user (what client components receive). */
export function toProfile({ onboardedAt, customThemes, ...user }: CurrentUser): Profile {
  return {
    ...user,
    // Re-validated so a hand-edited database row can't break the picker.
    customThemes: normalizeCustomThemes(customThemes),
    onboarded: onboardedAt !== null,
  };
}
