/**
 * Fixes the most common copy-paste mistakes in environment variables, so a
 * stray quote or space can't break login or the database:
 *   "value"  'value'   (quotes pasted into Vercel's Value box are kept literally)
 *   KEY=value          (the whole line pasted instead of just the value)
 *   spaces / line breaks at the start or end
 *   GOCSPX-abc\_def    (a backslash added by chat apps before underscores)
 *   ...&amp;...        (an HTML-escaped "&" in a connection string)
 *
 * Real keys never contain these, so cleaning them is always safe.
 * No imports: this file is used by src/proxy.ts, the server and prisma.config.ts.
 */
export const CLEANED_ENV_KEYS = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_RESEND_KEY",
  "AUTH_EMAIL_FROM",
  "DATABASE_URL",
  "DIRECT_URL",
  "AI_PROVIDER",
  "AI_API_URL",
] as const;

export function cleanEnvValue(raw: string | undefined, key?: string): string | undefined {
  if (raw === undefined) return undefined;
  let value = raw.trim();
  if (key && value.startsWith(`${key}=`)) value = value.slice(key.length + 1).trim();
  // Remove matching quotes around the whole value (repeat for ""value"").
  while (value.length >= 2 && /^(["'`])[\s\S]*\1$/.test(value)) value = value.slice(1, -1).trim();
  value = value.replace(/\\_/g, "_");
  if (key === "DATABASE_URL" || key === "DIRECT_URL") value = value.replace(/&amp;/g, "&");
  return value;
}

/** Cleans the known keys in place, once per process. Returns the keys that were changed. */
export function cleanEnv(env: Record<string, string | undefined> = process.env): string[] {
  const changed: string[] = [];
  for (const key of CLEANED_ENV_KEYS) {
    const before = env[key];
    const after = cleanEnvValue(before, key);
    if (before !== undefined && after !== before) {
      env[key] = after;
      changed.push(key);
    }
  }
  return changed;
}
