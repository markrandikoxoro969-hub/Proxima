/**
 * Works out which AI to use from the environment, forgiving common mistakes:
 *   AI_PROVIDER="sujan-core" (or empty)   → the real PROXIMA Core API  ✓ normal
 *   AI_PROVIDER="mock"                     → fake offline AI for design work
 *   AI_PROVIDER="https://…/chat"           → a web address in the wrong box: we use it as
 *                                            the AI address with sujan-core (and log a tip)
 *   AI_PROVIDER="something-else"           → unknown name: use the real AI instead of
 *                                            breaking every chat (and log a tip)
 * The AI address itself belongs in AI_API_URL (optional; the default is below).
 */
export const DEFAULT_SUJAN_CORE_URL = "https://sujancoreapi.onrender.com/chat";
export const KNOWN_AI_PROVIDERS = ["sujan-core", "mock"] as const;
export type AiProviderId = (typeof KNOWN_AI_PROVIDERS)[number];

export type AiSettings = { id: AiProviderId; url: string; warning?: string };

const isWebAddress = (value: string) => /^https?:\/\//i.test(value);

export function resolveAiSettings(env: Record<string, string | undefined> = process.env): AiSettings {
  const raw = (env.AI_PROVIDER ?? "").trim();
  const apiUrl = (env.AI_API_URL ?? "").trim();
  const url = (fallback: string) => (isWebAddress(apiUrl) ? apiUrl : fallback);

  if (!raw) return { id: "sujan-core", url: url(DEFAULT_SUJAN_CORE_URL) };

  if (isWebAddress(raw)) {
    return {
      id: "sujan-core",
      url: url(raw),
      warning:
        'AI_PROVIDER contains a web address. It should be the name "sujan-core". The address was used anyway; ' +
        "move it to AI_API_URL (or delete it: the PROXIMA Core API is the default).",
    };
  }

  const name = raw.toLowerCase();
  if ((KNOWN_AI_PROVIDERS as readonly string[]).includes(name)) {
    return { id: name as AiProviderId, url: url(DEFAULT_SUJAN_CORE_URL) };
  }

  return {
    id: "sujan-core",
    url: url(DEFAULT_SUJAN_CORE_URL),
    warning: `AI_PROVIDER "${raw}" is unknown (options: ${KNOWN_AI_PROVIDERS.join(", ")}). Using "sujan-core".`,
  };
}
