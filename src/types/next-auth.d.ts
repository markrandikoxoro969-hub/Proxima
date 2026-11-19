import type { DefaultSession } from "next-auth";

// Tell TypeScript that session.user.id always exists (we set it in auth.config.ts).
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
