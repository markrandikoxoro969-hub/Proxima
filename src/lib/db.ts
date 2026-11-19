import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * The ONE database client for the whole app (server only).
 *
 * - Uses Neon's serverless driver (fast connections on Vercel).
 * - Created lazily on first use, so `next build` works even before
 *   DATABASE_URL is set, and you get a clear error message if it's missing.
 * - Reused across hot reloads in development (no "too many connections").
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy the pooled connection string from Neon into .env.local (see docs/ACCOUNTS.md).",
    );
  }
  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

/** Use like a normal Prisma client: `await db.user.findUnique(...)`. */
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
