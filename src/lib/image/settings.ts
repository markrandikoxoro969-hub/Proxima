/**
 * Works out which image engine to use, from the environment.
 *
 *   IMAGE_PROVIDER="auto"         → the best one that has a key, else the free
 *                                   keyless service, else the offline preview
 *   IMAGE_PROVIDER="openai"       → OpenAI Images (create + edit)
 *   IMAGE_PROVIDER="nvidia"       → NVIDIA NIM / Stability SDXL (create only)
 *   IMAGE_PROVIDER="pollinations" → keyless service (create + edit)
 *   IMAGE_PROVIDER="mock"         → offline SVG preview, no network at all
 *
 * The key itself is only ever read inside the provider that needs it; it is
 * never returned from this module, logged, or sent to the browser.
 */
export const KNOWN_IMAGE_PROVIDERS = ["auto", "openai", "nvidia", "pollinations", "mock"] as const;
export type ImageProviderId = (typeof KNOWN_IMAGE_PROVIDERS)[number];
export type ConcreteImageProviderId = Exclude<ImageProviderId, "auto">;

export const DEFAULT_IMAGE_PROVIDER: ImageProviderId = "auto";

export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1";
export const DEFAULT_NVIDIA_IMAGE_MODEL = "stabilityai/stable-diffusion-xl";
export const DEFAULT_NVIDIA_IMAGE_URL = "https://ai.api.nvidia.com/v1/genai";
export const DEFAULT_POLLINATIONS_URL = "https://image.pollinations.ai/prompt";
/** The modern, keyed endpoint: honours `nologo` (no watermark) and can edit. */
export const DEFAULT_POLLINATIONS_KEYED_URL = "https://gen.pollinations.ai/image";
export const DEFAULT_POLLINATIONS_MODEL = "flux";
export const DEFAULT_POLLINATIONS_EDIT_MODEL = "kontext";

export type ImageSettings = {
  /** What IMAGE_PROVIDER said, after forgiving common mistakes. */
  id: ImageProviderId;
  /** A note for the logs when a setting looked wrong (never a key). */
  warning?: string;
};

export function resolveImageSettings(env: Record<string, string | undefined> = process.env): ImageSettings {
  const raw = (env.IMAGE_PROVIDER ?? "").trim().toLowerCase();
  if (!raw) {
    // The old offline mode should also switch images off the network.
    return { id: (env.AI_PROVIDER ?? "").trim().toLowerCase() === "mock" ? "mock" : DEFAULT_IMAGE_PROVIDER };
  }
  if ((KNOWN_IMAGE_PROVIDERS as readonly string[]).includes(raw)) {
    return { id: raw as ImageProviderId };
  }
  if (/^https?:\/\//.test(raw)) {
    return {
      id: DEFAULT_IMAGE_PROVIDER,
      warning: 'IMAGE_PROVIDER looks like a web address; it should be a name like "openai". Using auto.',
    };
  }
  return {
    id: DEFAULT_IMAGE_PROVIDER,
    warning: `IMAGE_PROVIDER "${raw}" is unknown (options: ${KNOWN_IMAGE_PROVIDERS.join(", ")}). Using auto.`,
  };
}

export const openaiImageConfigured = (env: Record<string, string | undefined> = process.env) =>
  Boolean((env.OPENAI_API_KEY ?? "").trim());

export const nvidiaImageConfigured = (env: Record<string, string | undefined> = process.env) =>
  Boolean((env.NVIDIA_API_KEY ?? "").trim());

/** How long to wait for an image before giving up (ms). */
export const imageTimeoutMs = (env: Record<string, string | undefined> = process.env) => {
  const value = Number(env.IMAGE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 180_000) : 90_000;
};

export const openaiImageModel = (env: Record<string, string | undefined> = process.env) =>
  (env.OPENAI_IMAGE_MODEL ?? "").trim() || DEFAULT_OPENAI_IMAGE_MODEL;

export const nvidiaImageModel = (env: Record<string, string | undefined> = process.env) =>
  (env.NVIDIA_IMAGE_MODEL ?? "").trim() || DEFAULT_NVIDIA_IMAGE_MODEL;

export const nvidiaImageBaseUrl = (env: Record<string, string | undefined> = process.env) =>
  ((env.NVIDIA_IMAGE_URL ?? "").trim() || DEFAULT_NVIDIA_IMAGE_URL).replace(/\/$/, "");

/**
 * Optional Pollinations key (free account at enter.pollinations.ai).
 *
 * With a key the request goes to gen.pollinations.ai, which respects
 * `nologo=true` (no watermark) and lets the "kontext" model edit pictures.
 * Without one we use the keyless legacy endpoint, which works immediately but
 * brands the result with a small watermark and throttles anonymous requests.
 */
export const pollinationsApiKey = (env: Record<string, string | undefined> = process.env) =>
  ((env.POLLINATIONS_API_KEY ?? env.POLLINATIONS_TOKEN ?? "") as string).trim();

export const pollinationsConfigured = (env: Record<string, string | undefined> = process.env) =>
  Boolean(pollinationsApiKey(env));

export const pollinationsUrl = (env: Record<string, string | undefined> = process.env) => {
  const explicit = (env.POLLINATIONS_IMAGE_URL ?? "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  return pollinationsConfigured(env) ? DEFAULT_POLLINATIONS_KEYED_URL : DEFAULT_POLLINATIONS_URL;
};

export const pollinationsImageModel = (env: Record<string, string | undefined> = process.env) =>
  (env.POLLINATIONS_IMAGE_MODEL ?? "").trim() || DEFAULT_POLLINATIONS_MODEL;

export const pollinationsEditModel = (env: Record<string, string | undefined> = process.env) =>
  (env.POLLINATIONS_EDIT_MODEL ?? "").trim() || DEFAULT_POLLINATIONS_EDIT_MODEL;

/**
 * A note the studio shows under a picture, when there is something honest to
 * say about it. Right now: the free keyless tier brands images with a small
 * watermark, which a free key removes.
 */
export function imageWatermarkNote(env: Record<string, string | undefined> = process.env): string | null {
  const engine = resolveImageSettings(env).id;
  if (engine === "mock") return null;
  if (openaiImageConfigured(env) || nvidiaImageConfigured(env)) return null;
  if (pollinationsConfigured(env)) return null;
  return "The free image service adds a small watermark and is limited to a few edits a minute. Add a free Pollinations key (POLLINATIONS_API_KEY) to remove the watermark and make editing reliable.";
}
