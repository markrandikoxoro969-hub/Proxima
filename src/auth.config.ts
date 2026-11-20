import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { cleanEnv } from "@/lib/env-clean";

// Remove stray quotes/spaces from pasted keys before Auth.js reads them.
const fixedKeys = cleanEnv();
if (fixedKeys.length > 0) {
  console.warn(
    `[proxima] Removed extra quotes/spaces from: ${fixedKeys.join(", ")}. It works, but tidy them in your settings.`,
  );
}

/**
 * Shared login settings. This file must stay LIGHT (no database import),
 * because src/proxy.ts runs it before protected pages load.
 * The full setup (with database) is in src/auth.ts.
 */

/** Pages that need you to be signed in. */
export const PROTECTED_PREFIXES = ["/app", "/settings"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export const authConfig = {
  // Google reads AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET from the environment.
  providers: [Google],
  pages: {
    signIn: "/login",
    error: "/login", // errors show nicely on our own login page
    verifyRequest: "/login/verify", // "check your email" (email login, later)
  },
  session: {
    // Encrypted cookie sessions: no database lookup on every page view = faster.
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  // Vercel sets the correct host. Needed for `npm start` locally too.
  trustHost: true,
  callbacks: {
    /** Runs in src/proxy.ts for protected pages and /login. */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);

      if (isProtectedPath(nextUrl.pathname)) {
        if (isLoggedIn) return true;
        // Send to /login and come back here afterwards (relative path only).
        const login = new URL("/login", nextUrl);
        login.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
        return Response.redirect(login);
      }

      // Already signed in? Skip the login page.
      if (nextUrl.pathname === "/login" && isLoggedIn) {
        return Response.redirect(new URL("/app", nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      // On sign-in, remember the database user id inside the encrypted cookie.
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
