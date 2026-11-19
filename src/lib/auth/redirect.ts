/**
 * Only allow redirects to pages on OUR site after login.
 * Blocks "open redirect" tricks like ?callbackUrl=https://evil.com or //evil.com.
 */
export const DEFAULT_AFTER_LOGIN = "/app";

export function safeCallbackUrl(value: unknown, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  // Must be a path on this site: starts with one "/", not "//" or "/\".
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // No control characters (tabs/newlines can be used to smuggle URLs).
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  // Never bounce back to the login page itself or the auth API.
  if (value.startsWith("/login") || value.startsWith("/api/auth")) return fallback;
  return value;
}
