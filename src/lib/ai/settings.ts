/**
 * Works out which AI to use from the environment, forgiving common mistakes.
 *
 *   AI_PROVIDER="nvidia"       → NVIDIA NIM (default when a key is set)
 *   AI_PROVIDER="render"       → the old PROXIMA Core API on Render
 *   AI_PROVIDER="mock"         → fake offline AI for design work
 *   AI_PROVIDER="https://…"    → a web address in the wrong box: used as the
 *                                Render address, with a tip in the logs
 *   AI_PROVIDER="something"    → unknown name: use the default, with a tip
 *
 * NVIDIA settings (all optional except the key):
 *   NVIDIA_API_KEY, NVIDIA_MODEL, NVIDIA_MAX_TOKENS, NVIDIA_ENABLE_THINKING,
 *   NVIDIA_VISION_MODEL, NVIDIA_VISION_API_KEY
 * Render settings:
 *   AI_API_URL (defaults to the PROXIMA Core API)
 *
 * Nothing in this file touches the network or reads a secret into the browser:
 * it is only ever imported by server code.
 */
export const DEFAULT_RENDER_URL = "https://sujancoreapi.onrender.com/chat";
/** Kept for older code/tests that imported the old name. */
export const DEFAULT_SUJAN_CORE_URL = DEFAULT_RENDER_URL;

export const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const DEFAULT_NVIDIA_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
/**
 * Hard ceiling for one answer, including the model's private reasoning. It must
 * be at least the largest mode budget (Coding: 8192), otherwise a long answer
 * is cut off mid-sentence, mid-table or mid-code-block.
 */
export const DEFAULT_NVIDIA_MAX_TOKENS = 8192;
/**
 * Used when someone attaches a picture and the main model is text-only.
 * Nemotron 3 Nano Omni reads the picture (OCR, screenshots, charts, objects)
 * and hands a description to the main model, so pictures work without changing
 * NVIDIA_MODEL. It runs with thinking off here so the description arrives
 * quickly and the small token budget is spent on observations, not reasoning.
 * Set NVIDIA_VISION_MODEL to another vision id (or "off") to override.
 */
export const DEFAULT_NVIDIA_VISION_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

/** The default provider when AI_PROVIDER is not set. */
export const DEFAULT_AI_PROVIDER = "nvidia";

export const KNOWN_AI_PROVIDERS = ["nvidia", "render", "sujan-core", "mock"] as const;
export type AiProviderId = (typeof KNOWN_AI_PROVIDERS)[number];
/** The providers that can actually be used (sujan-core is an alias of render). */
export type NormalizedProviderId = "nvidia" | "render" | "mock";

export type AiSettings = {
  /** Which provider to try first. */
  id: NormalizedProviderId;
  /** Render address (only used by the render provider / fallback). */
  url: string;
  /** A friendly note for the logs when a setting looked wrong. */
  warning?: string;
};

const isWebAddress = (value: string) => /^https?:\/\//i.test(value);
const number = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export function resolveAiSettings(env: Record<string, string | undefined> = process.env): AiSettings {
  const raw = (env.AI_PROVIDER ?? "").trim();
  const apiUrl = (env.AI_API_URL ?? "").trim();
  const url = isWebAddress(apiUrl) ? apiUrl : DEFAULT_RENDER_URL;

  if (!raw) return { id: DEFAULT_AI_PROVIDER, url };

  if (isWebAddress(raw)) {
    return {
      id: "render",
      url: raw,
      warning:
        'AI_PROVIDER contains a web address. It should be a name like "nvidia" or "render". ' +
        "The address was used for Render anyway; move it to AI_API_URL.",
    };
  }

  const name = raw.toLowerCase();
  if (name === "sujan-core" || name === "render") return { id: "render", url };
  if (name === "nvidia") return { id: "nvidia", url };
  if (name === "mock") return { id: "mock", url };

  return {
    id: DEFAULT_AI_PROVIDER,
    url,
    warning: `AI_PROVIDER "${raw}" is unknown (options: ${KNOWN_AI_PROVIDERS.join(
      ", ",
    )}). Using "${DEFAULT_AI_PROVIDER}".`,
  };
}

export type NvidiaSettings = {
  /** Key for the normal answering model. */
  apiKey: string;
  /** Key for the picture reader; NVIDIA_VISION_API_KEY, or NVIDIA_API_KEY when empty. */
  visionApiKey: string;
  model: string;
  /** Vision model used to describe pictures for a text-only main model. "" = off. */
  visionModel: string;
  maxTokens: number;
  enableThinking: boolean;
  baseURL: string;
  /** How long to wait for the first token before falling back (ms). */
  firstTokenTimeoutMs: number;
};

/**
 * NVIDIA settings, read fresh on every call so tests (and Vercel env changes)
 * take effect without a rebuild.
 */
export function resolveNvidiaSettings(env: Record<string, string | undefined> = process.env): NvidiaSettings {
  const thinking = (env.NVIDIA_ENABLE_THINKING ?? "true").trim().toLowerCase();
  const vision = (env.NVIDIA_VISION_MODEL ?? "").trim();
  const apiKey = (env.NVIDIA_API_KEY ?? "").trim();
  // The two models can belong to different NVIDIA accounts. When no separate
  // vision key is set, the reader reuses the main key (the old behaviour).
  const visionApiKey = (env.NVIDIA_VISION_API_KEY ?? "").trim() || apiKey;
  return {
    apiKey,
    visionApiKey,
    model: (env.NVIDIA_MODEL ?? "").trim() || DEFAULT_NVIDIA_MODEL,
    visionModel: /^(off|none|false|0)$/i.test(vision) ? "" : vision || DEFAULT_NVIDIA_VISION_MODEL,
    maxTokens: number(env.NVIDIA_MAX_TOKENS, DEFAULT_NVIDIA_MAX_TOKENS),
    // On by default: the model reasons silently before it answers.
    enableThinking: thinking !== "false" && thinking !== "0" && thinking !== "off",
    baseURL: (env.NVIDIA_BASE_URL ?? "").trim() || DEFAULT_NVIDIA_BASE_URL,
    firstTokenTimeoutMs: number(env.NVIDIA_TIMEOUT_MS, 45_000),
  };
}
