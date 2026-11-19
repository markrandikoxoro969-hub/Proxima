/**
 * A real Postgres database for tests — runs in memory (PGlite), no Neon needed.
 * It applies the SAME migration files that production uses, so tests also
 * prove the migrations work.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export type TestDb = { prisma: PrismaClient; pglite: PGlite; close: () => Promise<void> };

export async function createTestDb(): Promise<TestDb> {
  const pglite = await PGlite.create();

  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  const folders = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const folder of folders) {
    await pglite.exec(readFileSync(join(migrationsDir, folder, "migration.sql"), "utf8"));
  }

  const server = new PGLiteSocketServer({ db: pglite, port: 0, host: "127.0.0.1" });
  await server.start();
  const conn = server.getServerConn(); // "127.0.0.1:PORT"

  const base = new PrismaClient({
    adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${conn}/postgres`, max: 1 }),
  });

  // PGlite's test server drops the connection after a failed query (real
  // Postgres/Neon don't). Retry once so one expected error can't break the next test.
  const prisma = base.$extends({
    query: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (error) {
          if (String(error).includes("Connection terminated unexpectedly")) return query(args);
          throw error;
        }
      },
    },
  }) as unknown as PrismaClient;

  return {
    prisma,
    pglite,
    close: async () => {
      await base.$disconnect();
      await server.stop();
      await pglite.close();
    },
  };
}
