#!/usr/bin/env node
/**
 * Setup doctor:   npm run env:check
 *
 * Checks your .env.local step by step and tells you exactly what to fix:
 *   1. Are all the required values there and in the right format?
 *   2. Can we reach your Neon database?
 *   3. Have the database tables been created (migrations)?
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const bad = (msg, fix) => {
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
  if (fix) console.log(`      → ${fix}`);
  failures++;
};
const info = (msg) => console.log(`  \x1b[90m•\x1b[0m ${msg}`);
let failures = 0;

const env = process.env;
const pg = /^postgres(ql)?:\/\//;

console.log("\nPROXIMA setup check\n");
console.log("1) Settings in .env.local");

if (!env.DATABASE_URL)
  bad("DATABASE_URL is missing", "Neon → Connect → pooling ON → copy (docs/ACCOUNTS.md A5)");
else if (!pg.test(env.DATABASE_URL)) bad("DATABASE_URL should start with postgresql://");
else if (!env.DATABASE_URL.includes("-pooler"))
  bad(
    "DATABASE_URL should be the POOLED string (contains -pooler)",
    "In Neon's Connect popup turn Connection pooling ON",
  );
else ok("DATABASE_URL (pooled)");

if (!env.DIRECT_URL)
  bad("DIRECT_URL is missing", "Neon → Connect → pooling OFF → copy (docs/ACCOUNTS.md A6)");
else if (!pg.test(env.DIRECT_URL)) bad("DIRECT_URL should start with postgresql://");
else if (env.DIRECT_URL.includes("-pooler"))
  bad("DIRECT_URL must NOT contain -pooler", "In Neon's Connect popup turn Connection pooling OFF");
else ok("DIRECT_URL (direct)");

if (!env.AUTH_SECRET)
  bad("AUTH_SECRET is missing", "Run the generator command in docs/ACCOUNTS.md (Auth secret)");
else if (env.AUTH_SECRET.length < 32) bad("AUTH_SECRET is too short (needs 32+ characters)");
else ok("AUTH_SECRET");

if (!env.AUTH_GOOGLE_ID) bad("AUTH_GOOGLE_ID is missing", "Google Cloud → Clients → Proxima Web → Client ID");
else if (!env.AUTH_GOOGLE_ID.endsWith(".apps.googleusercontent.com"))
  bad("AUTH_GOOGLE_ID should end with .apps.googleusercontent.com");
else ok("AUTH_GOOGLE_ID");

if (!env.AUTH_GOOGLE_SECRET)
  bad("AUTH_GOOGLE_SECRET is missing", "Google Cloud → Clients → Proxima Web → Client secret");
else ok("AUTH_GOOGLE_SECRET");

if (env.AUTH_RESEND_KEY && env.AUTH_EMAIL_FROM) ok("Email login: ON (Resend configured)");
else info("Email login: off (optional — add AUTH_RESEND_KEY + AUTH_EMAIL_FROM later)");

console.log("\n2) Database connection");
if (env.DATABASE_URL && pg.test(env.DATABASE_URL)) {
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(env.DATABASE_URL);
    const started = Date.now();
    await sql`select 1`;
    ok(`Connected to Neon (${Date.now() - started} ms)`);

    console.log("\n3) Database tables");
    const [row] =
      await sql`select to_regclass('public."User"') as users, to_regclass('public."Conversation"') as convos`;
    if (row.users && row.convos) ok("Tables exist (migrations applied)");
    else bad("Tables not found", "Run:  npm run db:deploy");
  } catch (error) {
    bad(
      `Could not connect: ${error.message}`,
      "Re-copy DATABASE_URL from Neon; check your internet connection",
    );
  }
} else {
  info("Skipped (fix DATABASE_URL first)");
}

console.log("");
if (failures) {
  console.log(`\x1b[31m${failures} problem(s) found.\x1b[0m Fix them in .env.local, then run this again.\n`);
  process.exit(1);
}
console.log("\x1b[32mAll good! Run `npm run dev` and open http://localhost:3000/login\x1b[0m\n");
