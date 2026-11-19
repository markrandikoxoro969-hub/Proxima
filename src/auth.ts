import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Resend from "next-auth/providers/resend";
import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import { isEmailLoginEnabled } from "@/lib/env";

/**
 * Full Auth.js setup (server only).
 *
 * Google login: always on.
 * Email magic-link: READY but OFF. It switches on automatically when you add
 *   AUTH_RESEND_KEY and AUTH_EMAIL_FROM to your environment (see docs/ACCOUNTS.md → D).
 */
const providers: Provider[] = [...authConfig.providers];

if (isEmailLoginEnabled()) {
  providers.push(
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers,
});
