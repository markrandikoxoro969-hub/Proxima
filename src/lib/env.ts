import "server-only";
import { z } from "zod";

/**
 * Server environment variables, checked with zod.
 * If something is missing you get ONE clear message listing what to fix,
 * instead of a confusing crash later. See docs/ACCOUNTS.md for how to get each value.
 */
const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, "must start with postgresql:// (copy it from Neon → Connect)");

const serverSchema = z.object({
  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl.optional(),
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters (generate one, see docs/ACCOUNTS.md)"),
  AUTH_GOOGLE_ID: z
    .string()
    .endsWith(".apps.googleusercontent.com", "should end with .apps.googleusercontent.com"),
  AUTH_GOOGLE_SECRET: z.string().min(10, "copy the Client secret from Google Cloud → Clients"),
  // Optional: email magic-link login. Leave empty to keep it switched off.
  AUTH_RESEND_KEY: z.string().optional(),
  AUTH_EMAIL_FROM: z.string().optional(),
  // Phase 3: AI engine (all optional — sensible defaults).
  AI_PROVIDER: z.enum(["sujan-core", "mock"]).optional(),
  AI_API_URL: z.url("must be a full URL like https://sujancoreapi.onrender.com/chat").optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).optional(),
  ALLOWED_ORIGINS: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export type EnvCheck = { ok: true; env: ServerEnv } | { ok: false; problems: string[] };

export function checkEnv(source: Record<string, string | undefined> = process.env): EnvCheck {
  // Treat empty strings as "not set".
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const result = serverSchema.safeParse(cleaned);
  if (result.success) return { ok: true, env: result.data };
  const problems = result.error.issues.map((issue) => {
    const key = issue.path.join(".");
    return issue.code === "invalid_type" ? `${key} is missing` : `${key} ${issue.message}`;
  });
  return { ok: false, problems };
}

/** Prints a friendly report at server start (called from src/instrumentation.ts). */
export function reportEnv(): boolean {
  const result = checkEnv();
  if (result.ok) return true;
  const line = "─".repeat(64);
  console.error(
    [
      "",
      line,
      " PROXIMA: some settings in .env.local are missing or wrong:",
      ...result.problems.map((p) => `   • ${p}`),
      "",
      " Fix: follow docs/ACCOUNTS.md, then restart `npm run dev`.",
      " (Pages that don't need login still work; login/chat won't.)",
      line,
      "",
    ].join("\n"),
  );
  return false;
}

/** True when both Resend settings exist → the email login form appears. */
export function isEmailLoginEnabled(): boolean {
  return Boolean(process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM);
}
