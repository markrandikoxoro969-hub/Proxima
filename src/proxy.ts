import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Proxy (Next.js 16's new name for "middleware").
 * Runs BEFORE protected pages: if you're not signed in, you're sent to /login.
 * It only reads the encrypted login cookie — no database call, so it's fast.
 *
 * Pages also double-check on the server (see src/lib/auth/session.ts),
 * and API routes check for themselves and return 401 instead of redirecting.
 */
const { auth } = NextAuth(authConfig);

export const proxy = auth;

export const config = {
  // Only these paths run the proxy. The landing page stays fully static.
  matcher: ["/app/:path*", "/settings/:path*", "/login"],
};
