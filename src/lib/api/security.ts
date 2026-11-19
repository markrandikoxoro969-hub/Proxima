import "server-only";
import { createHash } from "node:crypto";
import { apiErrors } from "./http";

/**
 * CORS / CSRF policy: our API is for our own website only.
 * Browsers always send an `Origin` header on POST/PATCH/DELETE; if it isn't
 * our site (or listed in ALLOWED_ORIGINS), the request is refused.
 * No `Access-Control-Allow-Origin` header is ever sent for unknown sites,
 * so other websites can't read our responses either.
 */
function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    // No Origin: same-origin GET, or a non-browser client (curl, tests).
    const site = request.headers.get("sec-fetch-site");
    return !site || site === "same-origin" || site === "none";
  }
  try {
    const { host, origin: normalized } = new URL(origin);
    const requestHost =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    return host === requestHost || allowedOrigins().includes(normalized);
  } catch {
    return false;
  }
}

export function assertSameOrigin(request: Request): void {
  if (!isSameOrigin(request)) throw apiErrors.forbidden("Cross-site requests are not allowed.");
}

/** Visitor's IP (Vercel puts the real one first in x-forwarded-for). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/** We never store raw IPs: a salted hash is enough to rate-limit guests. */
export function hashedClientId(request: Request): string {
  return createHash("sha256")
    .update(`${clientIp(request)}|${process.env.AUTH_SECRET ?? "proxima"}`)
    .digest("hex")
    .slice(0, 32);
}
