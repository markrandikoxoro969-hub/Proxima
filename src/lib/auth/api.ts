import "server-only";
import { auth } from "@/auth";
import { apiErrors } from "@/lib/api/http";

/** For API routes: the signed-in user's id, or null for guests. No database call. */
export async function getApiUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** For API routes that need login: returns the user id or throws 401 (not a redirect). */
export async function requireApiUserId(): Promise<string> {
  const id = await getApiUserId();
  if (!id) throw apiErrors.unauthorized();
  return id;
}
