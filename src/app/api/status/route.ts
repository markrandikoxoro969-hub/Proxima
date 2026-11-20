import { getAiProvider } from "@/lib/ai";
import { json, withApi } from "@/lib/api/http";
import { hashedClientId } from "@/lib/api/security";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { runSetupCheck } from "@/lib/setup-check";
import { site } from "@/lib/site";

/**
 * GET /api/status — real "ENGINE ONLINE" indicator + latency (the original
 * file showed a fake "42ms"). Calling it also WAKES the Render server early,
 * so your first message is faster. The app calls it when /app opens.
 *
 *   { ai: { status: "online" | "waking" | "offline", latencyMs }, version }
 *
 * GET /api/status?setup=1 — sign-in doctor: checks the login keys and the
 * database, and says what to fix (never shows a key). See src/lib/setup-check.ts.
 */
const PING_TIMEOUT_MS = 3_500;

export const GET = withApi(async (request: Request) => {
  await enforceRateLimit(`status:${hashedClientId(request)}`, RATE_LIMITS.status, undefined, {
    failOpen: true,
  });
  if (new URL(request.url).searchParams.has("setup")) {
    const setup = await runSetupCheck(new URL(request.url).origin);
    return json({ setup });
  }

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
