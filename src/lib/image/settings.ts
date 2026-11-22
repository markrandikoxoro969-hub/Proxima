import { cleanEnvValue } from "@/lib/env-clean";

/**
 * Works out which image engine to use, from the environment.
 *
 *   IMAGE_PROVIDER="auto"    → NVIDIA FLUX if its key is set, then OpenAI,
 *                              or the offline preview if no real service is configured
 *   IMAGE_PROVIDER="openai"  → OpenAI Images (create + edit)
 *   IMAGE_PROVIDER="nvidia"  → NVIDIA FLUX.1 dev (create) and FLUX.1 Kontext
 *                              (edit), each with its own key
 *   IMAGE_PROVIDER="mock"    → offline SVG preview, no network at all
 *
 * Keys are only read inside the provider that needs them; they are never
 * returned from this module, logged, or sent to the browser.
 */
export const KNOWN_IMAGE_PROVIDERS = ["auto", "nvidia", "openai", "mock"] as const;
export type ImageProviderId = (typeof KNOWN_IMAGE_PROVIDERS)[number];
export type ConcreteImageProviderId = Exclude<ImageProviderId, "auto">;

export const DEFAULT_IMAGE_PROVIDER: ImageProviderId = "auto";

export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1";
/** Creating a picture. A separate NVIDIA account/key can own this model. */
export const DEFAULT_NVIDIA_IMAGE_MODEL = "black-forest-labs/flux.1-dev";
/** Changing an existing picture; takes the source as a data URL. */
export const DEFAULT_NVIDIA_IMAGE_EDIT_MODEL = "black-forest-labs/flux.1-kontext-dev";
export const DEFAULT_NVIDIA_IMAGE_URL = "https://ai.api.nvidia.com/v1/genai";

export type ImageSettings = {
  /** What IMAGE_PROVIDER said, after forgiving common mistakes. */
  id: ImageProviderId;
  /** A note for the logs when a setting looked wrong (never a key). */
  warning?: string;
};

export function resolveImageSettings(env: Record<string, string | undefined> = process.env): ImageSettings {
  const raw = (env.IMAGE_PROVIDER ?? "").trim().toLowerCase();
  if (!raw) {
    // Respect the old offline mode unless image keys explicitly enable images.
    return {
      id:
        (env.AI_PROVIDER ?? "").trim().toLowerCase() === "mock" &&
        !nvidiaImageConfigured(env) &&
        !nvidiaEditConfigured(env)
          ? "mock"
          : DEFAULT_IMAGE_PROVIDER,
    };
  }
  if ((KNOWN_IMAGE_PROVIDERS as readonly string[]).includes(raw)) {
    return { id: raw as ImageProviderId };
  }
  if (/^https?:\/\//.test(raw)) {
    return {
      id: DEFAULT_IMAGE_PROVIDER,
      warning: 'IMAGE_PROVIDER looks like a web address; it should be a name like "nvidia". Using auto.',
    };
  }
  return {
    id: DEFAULT_IMAGE_PROVIDER,
    warning: `IMAGE_PROVIDER is unknown (options: ${KNOWN_IMAGE_PROVIDERS.join(", ")}). Using auto.`,
  };
}

export const openaiImageConfigured = (env: Record<string, string | undefined> = process.env) =>
  Boolean((env.OPENAI_API_KEY ?? "").trim());

/**
 * Key for FLUX.1 dev (creating). Kept separate from `NVIDIA_API_KEY`: the
 * text model and the image models can live on different NVIDIA accounts, and
 * sending the text key to the image endpoint would just fail.
 */
export const nvidiaGenerationKey = (env: Record<string, string | undefined> = process.env) =>
  cleanEnvValue(env.IMAGE_GENERATION, "IMAGE_GENERATION") ?? "";

/**
 * Key for FLUX.1 Kontext (editing). Falls back to `IMAGE_GENERATION` so a
 * single account can use one key for both models; set both when the two
 * models live on different NVIDIA accounts.
 */
export const nvidiaEditingKey = (env: Record<string, string | undefined> = process.env) =>
  (cleanEnvValue(env.IMAGE_EDITING, "IMAGE_EDITING") ?? "") || nvidiaGenerationKey(env);

export const nvidiaImageConfigured = (env: Record<string, string | undefined> = process.env) =>
  Boolean(nvidiaGenerationKey(env));

export const nvidiaEditConfigured = (env: Record<string, string | undefined> = process.env) =>
  Boolean(nvidiaEditingKey(env));

/** How long to wait for an image before giving up (ms). */
export const imageTimeoutMs = (env: Record<string, string | undefined> = process.env) => {
  const value = Number(env.IMAGE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 180_000) : 90_000;
};

export const openaiImageModel = (env: Record<string, string | undefined> = process.env) =>
  (env.OPENAI_IMAGE_MODEL ?? "").trim() || DEFAULT_OPENAI_IMAGE_MODEL;

export const nvidiaImageModel = (env: Record<string, string | undefined> = process.env) =>
  (env.IMAGE_GENERATION_MODEL ?? "").trim() || DEFAULT_NVIDIA_IMAGE_MODEL;

export const nvidiaImageEditModel = (env: Record<string, string | undefined> = process.env) =>
  (env.IMAGE_EDITING_MODEL ?? "").trim() || DEFAULT_NVIDIA_IMAGE_EDIT_MODEL;

export const nvidiaImageBaseUrl = (env: Record<string, string | undefined> = process.env) =>
  ((env.NVIDIA_IMAGE_URL ?? "").trim() || DEFAULT_NVIDIA_IMAGE_URL).replace(/\/$/, "");

/**
 * A note the studio shows under a picture, when there is something honest to
 * say. NVIDIA FLUX and OpenAI do not watermark, and the offline preview says
 * so itself, so there is nothing to add today.
 */
export function imageWatermarkNote(): string | null {
  return null;
}
