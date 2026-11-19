import { getAiProvider } from "@/lib/ai";
import { json, withApi } from "@/lib/api/http";
import { hashedClientId } from "@/lib/api/security";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { site } from "@/lib/site";

/**
 * GET /api/status — real "ENGINE ONLINE" indicator + latency (the original
 * file showed a fake "42ms"). Calling it also WAKES the Render server early,
 * so your first message is faster. The app calls it when /app opens.
 *
 *   { ai: { status: "online" | "waking" | "offline", latencyMs }, version }
 */
const PING_TIMEOUT_MS = 3_500;

export const GET = withApi(async (request: Request) => {
  await enforceRateLimit(`status:${hashedClientId(request)}`, RATE_LIMITS.status, undefined, {
    failOpen: true,
  });
  const provider = getAiProvider();

  let status: "online" | "waking" | "offline" = "online";
  let latencyMs: number | null = null;

  if (provider.ping) {
    try {
      latencyMs = await provider.ping(AbortSignal.timeout(PING_TIMEOUT_MS));
    } catch (error) {
      // Timed out = Render is still starting up. Anything else = unreachable.
      status = (error as { code?: string }).code === "timeout" ? "waking" : "offline";
    }
  }

  return json({ ai: { status, latencyMs, provider: provider.id }, version: site.version });
});
