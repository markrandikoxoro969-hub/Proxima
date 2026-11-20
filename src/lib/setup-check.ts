import "server-only";
import { db } from "@/lib/db";

/**
 * "Why can't I sign in?" doctor for the live site:  /api/status?setup=1
 *
 * Auth.js hides the real reason behind "Configuration" (on purpose: errors can
 * contain secrets). This tests each part separately and says what to fix.
 * It only answers yes/no. It never shows any key or password.
 */
export type SetupCheck = { name: string; ok: boolean; detail: string };

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function runSetupCheck(origin: string): Promise<{ ok: boolean; checks: SetupCheck[] }> {
  const env = process.env;
  const callbackUrl = `${origin}/api/auth/callback/google`;
  const checks: SetupCheck[] = [];
  const add = (name: string, ok: boolean, good: string, bad: string) =>
    checks.push({ name, ok, detail: ok ? good : bad });

  add(
    "AUTH_SECRET",
    (env.AUTH_SECRET ?? "").length >= 32,
    "Set.",
    "Missing or shorter than 32 characters. Add it in Vercel → Settings → Environment Variables, then Redeploy.",
  );
  const idOk = (env.AUTH_GOOGLE_ID ?? "").endsWith(".apps.googleusercontent.com");
  add(
    "AUTH_GOOGLE_ID",
    idOk,
    "Set.",
    "Missing, or it doesn't end with .apps.googleusercontent.com. Copy the Client ID again from Google Cloud.",
  );
  const secretSet = Boolean(env.AUTH_GOOGLE_SECRET);
  add(
    "AUTH_GOOGLE_SECRET",
    secretSet,
    "Set.",
    "Missing. Copy the Client secret from Google Cloud (starts with GOCSPX-).",
  );

  // Ask Google whether the ID + secret pair is valid, using a fake login code:
  // "invalid_grant" = keys accepted (only the fake code was refused), "invalid_client" = wrong keys.
  if (idOk && secretSet) {
    try {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "proxima-setup-check",
          client_id: env.AUTH_GOOGLE_ID!,
          client_secret: env.AUTH_GOOGLE_SECRET!,
          redirect_uri: callbackUrl,
        }),
        signal: AbortSignal.timeout(6_000),
      });
      const { error } = ((await response.json().catch(() => ({}))) ?? {}) as { error?: string };
      if (error === "invalid_client" || error === "unauthorized_client") {
        add(
          "Google accepts the ID + secret",
          false,
          "",
          "Google says the Client secret does not match this Client ID (wrong, old or deleted secret). Google Cloud → Clients → Proxima Web → copy the CURRENT secret (or Add secret) → paste into AUTH_GOOGLE_SECRET on Vercel, without quotes → Redeploy.",
        );
      } else {
        add("Google accepts the ID + secret", true, "Yes.", "");
      }
    } catch {
      add("Google accepts the ID + secret", true, "Couldn't reach Google to test (skipped).", "");
    }
  }

  // Can we read the database, and do the tables exist?
  if (!env.DATABASE_URL) {
    add(
      "Database",
      false,
      "",
      "DATABASE_URL is missing. Add the Neon pooled string (with -pooler) on Vercel → Redeploy.",
    );
  } else {
    try {
      await db.user.count();
      add("Database", true, "Connected, tables exist.", "");
    } catch (error) {
      const code = (error as { code?: string }).code;
      add(
        "Database",
        false,
        "",
        code === "P2021"
          ? "Connected, but the tables are missing. Run  npm run db:deploy  on your computer (with the same Neon strings), or Redeploy on Vercel."
          : "Can't connect. Copy the POOLED string (contains -pooler) from Neon → Connect into DATABASE_URL on Vercel, without quotes → Redeploy. Also check the Neon project isn't suspended.",
      );
    }
  }

  checks.push({
    name: "Google redirect URI to add",
    ok: true,
    detail: `Google Cloud → Clients → Proxima Web → Authorized redirect URIs must include exactly: ${callbackUrl}`,
  });

  return { ok: checks.every((check) => check.ok), checks };
}
