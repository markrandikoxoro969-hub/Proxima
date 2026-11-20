import "server-only";
import { ApiError } from "@/lib/api/http";
import { db } from "@/lib/db";

/**
 * Rate limiting stored in Postgres (works across all Vercel servers — an
 * in-memory counter wouldn't, because each request may hit a different one).
 *
 * "Sliding window" estimate: count this minute + a fading share of last
 * minute. That stops bursts at the minute boundary (e.g. 20 at 12:00:59 and
 * 20 more at 12:01:00).
 */
export const RATE_LIMITS = {
  chatUser: { limit: 20, windowMs: 60_000 }, // signed-in: 20 messages / minute
  chatGuest: { limit: 5, windowMs: 60_000 }, // landing demo: 5 messages / minute
  api: { limit: 120, windowMs: 60_000 }, // other API calls per user
  image: { limit: 6, windowMs: 60_000 }, // AI pictures per user (they cost money)
  status: { limit: 30, windowMs: 60_000 }, // engine status checks per visitor
  // Voice: one request per 900-character piece, cached by the browser. 90/min
  // is roughly ten minutes of listening and leaves room to replay a reply.
  speechUser: { limit: 90, windowMs: 60_000 },
  speechGuest: { limit: 20, windowMs: 60_000 },
} as const;

export type RateLimitRule = { limit: number; windowMs: number };
export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

export async function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now = new Date(),
): Promise<RateLimitResult> {
  const windowStartMs = Math.floor(now.getTime() / rule.windowMs) * rule.windowMs;
  const windowStart = new Date(windowStartMs);
  const previousStart = new Date(windowStartMs - rule.windowMs);

  // Add 1 to this window's counter (atomic upsert) and read last window's count.
  const [current, previous] = await Promise.all([
    db.rateLimit.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    }),
    db.rateLimit.findUnique({
      where: { key_windowStart: { key, windowStart: previousStart } },
      select: { count: true },
    }),
  ]);

  const elapsed = (now.getTime() - windowStartMs) / rule.windowMs;
  const weighted = (previous?.count ?? 0) * (1 - elapsed) + current.count;
  const resetAt = new Date(windowStartMs + rule.windowMs);

  // Tidy up old counters now and then (about 1 in 50 requests).
  if (Math.random() < 0.02) {
    void db.rateLimit
      .deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 10 * rule.windowMs) } } })
      .catch(() => {});
  }

  return {
    allowed: weighted <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, Math.floor(rule.limit - weighted)),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
  };
}

/**
 * Checks the limit and throws a friendly 429 error if exceeded.
 * If the database can't be reached:
 *   - failOpen: false (default) → 503 "temporarily unavailable" (safe: no unlimited AI calls)
 *   - failOpen: true            → allow the request (for harmless endpoints like /api/status)
 */
export async function enforceRateLimit(
  key: string,
  rule: RateLimitRule,
  message?: string,
  { failOpen = false }: { failOpen?: boolean } = {},
): Promise<RateLimitResult> {
  let result: RateLimitResult;
  try {
    result = await checkRateLimit(key, rule);
  } catch (error) {
    console.error("[rate-limit] database unavailable:", (error as Error).message);
    if (failOpen) {
      const resetAt = new Date(Date.now() + rule.windowMs);
      return { allowed: true, limit: rule.limit, remaining: rule.limit, resetAt, retryAfterSeconds: 0 };
    }
    throw new ApiError(
      503,
      "service_unavailable",
      "PROXIMA is temporarily unavailable (database not reachable). Please try again in a minute.",
      { "Retry-After": "30" },
    );
  }
  if (!result.allowed) {
    throw new ApiError(
      429,
      "rate_limited",
      message ?? `Too many requests. Please wait ${result.retryAfterSeconds}s and try again.`,
      { ...rateLimitHeaders(result), "Retry-After": String(result.retryAfterSeconds) },
    );
  }
  return result;
}
