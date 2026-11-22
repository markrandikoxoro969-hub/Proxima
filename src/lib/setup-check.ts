import "server-only";
import { AiProviderError, getAiProvider, resolveAiSettings } from "@/lib/ai";
import { resolveNvidiaSettings } from "@/lib/ai/settings";
import {
  nvidiaEditingKey,
  nvidiaGenerationKey,
  nvidiaImageEditModel,
  nvidiaImageModel,
  openaiImageConfigured,
  openaiImageModel,
  resolveImageSettings,
} from "@/lib/image/settings";
import { db } from "@/lib/db";

/**
 * "Why doesn't it work?" doctor for the live site:  /api/status?setup=1
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

  checks.push(await checkAi());
  checks.push(pictureReaderStatus(env));
  checks.push(imageEngineStatus(env));

  checks.push({
    name: "Google redirect URI to add",
    ok: true,
    detail: `Google Cloud → Clients → Proxima Web → Authorized redirect URIs must include exactly: ${callbackUrl}`,
  });

  return { ok: checks.every((check) => check.ok), checks };
}

/**
 * Reports the image studio's create/edit models without a network call. Keys
 * are only named ("set"/"missing"), never printed.
 */
export function imageEngineStatus(env: Record<string, string | undefined> = process.env): SetupCheck {
  const name = "Image studio";
  const choice = resolveImageSettings(env);
  const generation = Boolean(nvidiaGenerationKey(env));
  const editing = Boolean(nvidiaEditingKey(env));
  const openai = openaiImageConfigured(env);
  const nvidia = `Using ${nvidiaImageModel(env)} to create`;
  const nvidiaEdit = editing ? `and ${nvidiaImageEditModel(env)} to edit` : "only; set IMAGE_EDITING to edit";

  if (choice.id === "mock") {
    return { name, ok: true, detail: "Offline preview (IMAGE_PROVIDER=mock)." };
  }
  if (choice.id === "openai") {
    return {
      name,
      ok: true,
      detail: openai
        ? `Using OpenAI ${openaiImageModel(env)} for create and edit.`
        : "OPENAI_API_KEY is not set; set it to enable images.",
    };
  }
  if (choice.id === "nvidia") {
    return {
      name,
      ok: true,
      detail: generation
        ? `${nvidia} ${nvidiaEdit}.`
        : editing
          ? `Using ${nvidiaImageEditModel(env)} to edit; set IMAGE_GENERATION to create.`
          : "Set IMAGE_GENERATION and IMAGE_EDITING to enable NVIDIA images.",
    };
  }
  if (generation) return { name, ok: true, detail: `${nvidia} ${nvidiaEdit}.` };
  if (editing)
    return {
      name,
      ok: true,
      detail: `Using ${nvidiaImageEditModel(env)} to edit; set IMAGE_GENERATION to create.`,
    };
  if (openai) return { name, ok: true, detail: `Using OpenAI ${openaiImageModel(env)} for create and edit.` };
  return {
    name,
    ok: true,
    detail:
      "Offline preview. Set IMAGE_GENERATION (FLUX.1 dev) and IMAGE_EDITING (FLUX.1 Kontext) on Vercel, then Redeploy.",
  };
}

/**
 * Makes the two-model setup visible in `/api/status?setup=1`: normal answers
 * use NVIDIA_MODEL; attached pictures use NVIDIA_VISION_MODEL. This is a
 * configuration report, not another network request.
 */
export function pictureReaderStatus(env: Record<string, string | undefined> = process.env): SetupCheck {
  const provider = resolveAiSettings(env);
  const nvidia = resolveNvidiaSettings(env);
  const name = "Picture reader";

  if (provider.id !== "nvidia") {
    return {
      name,
      ok: true,
      detail: `Not used: AI_PROVIDER is "${provider.id}", so the text-only Render fallback answers.`,
    };
  }
  if (!nvidia.apiKey) {
    return {
      name,
      ok: true,
      detail: "NVIDIA_API_KEY is not set, so the Render fallback answers and attached pictures are not read.",
    };
  }
  if (!nvidia.visionModel) {
    return {
      name,
      ok: true,
      detail: `Off (NVIDIA_VISION_MODEL=off). Normal answers still use ${nvidia.model}.`,
    };
  }
  const keyNote = (env.NVIDIA_VISION_API_KEY ?? "").trim() ? "separate vision key" : "NVIDIA_API_KEY";
  return {
    name,
    ok: true,
    detail: `Using ${nvidia.visionModel} for pictures (thinking off, ${keyNote}); normal answers use ${nvidia.model}.`,
  };
}

const AI_TEST_TIMEOUT_MS = 20_000;

/** Sends one tiny real message to the AI and checks that a reply comes back. */
async function checkAi(): Promise<SetupCheck> {
  const name = "AI engine";
  const settings = resolveAiSettings();
  const setting =
    settings.id === "mock"
      ? 'AI_PROVIDER is "mock": replies are FAKE. Set AI_PROVIDER to nvidia or render (or delete it) on Vercel, then Redeploy.'
      : null;
  if (setting) return { name, ok: false, detail: setting };

  const tip = settings.warning ? ` Tip: ${settings.warning}` : "";
  const provider = getAiProvider();
  const request = {
    message: "Reply with the single word: ok",
    sessionId: "proxima-setup-check",
    signal: AbortSignal.timeout(AI_TEST_TIMEOUT_MS),
  };

  const started = Date.now();
  try {
    if (provider.complete) {
      await provider.complete(request);
    } else if (provider.stream) {
      // Streaming providers (NVIDIA): read only the first answer token.
      for await (const delta of provider.stream(request)) {
        if (delta.type === "text" && delta.text.trim()) break;
      }
    }
    return {
      name,
      ok: true,
      detail: `Using ${provider.label}. Replied in ${((Date.now() - started) / 1000).toFixed(1)} s.${tip}`,
    };
  } catch (error) {
    const code = error instanceof AiProviderError ? error.code : undefined;
    const host = new URL(settings.url).origin;
    const detail =
      code === "timeout" || code === "aborted"
        ? `No reply within ${AI_TEST_TIMEOUT_MS / 1000} s. The free Render server is probably waking up: reload this page in a minute.`
        : code === "bad_response"
          ? `The AI answered, but not in the expected format { "reply": "..." }. Check ${settings.url}.`
          : `Couldn't get a reply from ${settings.url}${error instanceof AiProviderError && error.status ? ` (HTTP ${error.status})` : ""}. Open ${host} in your browser to see if the AI server is up.`;
    return { name, ok: false, detail: detail + tip };
  }
}
