/**
 * Prisma CLI configuration (used by `prisma migrate`, `prisma studio`, …).
 * The running website does NOT use this file — it connects in src/lib/db.ts.
 */
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";
import { cleanEnv } from "./src/lib/env-clean";

// Next.js keeps local secrets in .env.local, so load that first, then .env.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });
cleanEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need the DIRECT (non-pooled) Neon URL.
    // The fallback only lets `prisma generate` run before you've set up .env.local
    // (generate never connects to the database).
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "postgresql://not-set:5432/not-set",
  },
});
