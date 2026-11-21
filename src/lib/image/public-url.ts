import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A short-lived public address for one picture.
 *
 * Some image engines fetch the source themselves instead of taking its bytes,
 * so our owner-only /api/images/:id route would be useless to them. The server
 * can sign a short-lived link:
 *
 *   /api/images/<id>/source?exp=<ms>&sig=<hmac>
 *
 * The signature covers the id and the expiry, so the link can't be changed into
 * a different picture and it stops working after a few minutes. Nothing about
 * the owner is exposed, and a stolen link dies on its own.
 */

/** How long an engine has to fetch the picture. Generous, but not permanent. */
export const IMAGE_LINK_TTL_MS = 10 * 60 * 1000;

function signingSecret(): string {
  // AUTH_SECRET always exists in a working deployment; the dedicated variable
  // is there for people who rotate their auth secret.
  return (process.env.IMAGE_SIGNING_SECRET ?? process.env.AUTH_SECRET ?? "").trim();
}

/** Exported for tests: is signing possible at all? */
export const canSignImageLinks = () => signingSecret().length > 0;

/** HMAC of `<id>.<expiry>`; null when no secret is configured (offline/dev). */
export function signImageId(id: string, expiresAt: number): string | null {
  const secret = signingSecret();
  if (!secret || !Number.isFinite(expiresAt)) return null;
  return createHmac("sha256", secret).update(`${id}.${expiresAt}`).digest("base64url");
}

/** True when the signature is ours and the link hasn't expired. */
export function verifyImageLink(
  id: string,
  expiresAt: number,
  signature: string,
  now: number = Date.now(),
): boolean {
  if (!signature || !Number.isFinite(expiresAt) || expiresAt <= now) return false;
  const expected = signImageId(id, expiresAt);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The address the outside world uses for this deployment.
 *
 * NEXT_PUBLIC_SITE_URL wins (it also covers proxies that rewrite Host), and we
 * fall back to the forwarded host of the current request so editing works on a
 * preview deployment the moment it has a real domain.
 */
export function publicOrigin(request?: Request): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(configured)) return configured;
  if (!request) return "";

  const headers = request.headers;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  if (!host) return "";
  const proto =
    (headers.get("x-forwarded-proto") ?? "").split(",")[0].trim() ||
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** A local or private address: services on the internet can't reach it. */
const isReachable = (origin: string) => {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    const local =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    return !local && (url.protocol === "https:" || url.protocol === "http:");
  } catch {
    return false;
  }
};

/** Signed, expiring link for engines that fetch the picture themselves. */
export function signedImageUrl(id: string, request?: Request, ttlMs = IMAGE_LINK_TTL_MS): string | undefined {
  const origin = publicOrigin(request);
  if (!origin || !isReachable(origin)) return undefined;
  const expiresAt = Date.now() + ttlMs;
  const signature = signImageId(id, expiresAt);
  if (!signature) return undefined;
  return `${origin}/api/images/${encodeURIComponent(id)}/source?exp=${expiresAt}&sig=${signature}`;
}

/** Exported for tests. */
export const isPubliclyReachable = isReachable;
