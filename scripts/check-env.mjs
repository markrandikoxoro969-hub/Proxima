#!/usr/bin/env node
/**
 * Setup doctor:   npm run env:check
 *
 * Checks your .env.local step by step and tells you exactly what to fix:
 *   1. Are all the required values there and in the right format?
 *   2. Can we reach your Neon database?
 *   3. Have the database tables been created (migrations)?
 *   4. Is the AI engine reachable? (Phase 3)
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
const isLocal = (url) => {
  try {
    return ["localhost", "127.0.0.1", "[::1]", "host.docker.internal"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};
const localDb = env.DATABASE_URL ? isLocal(env.DATABASE_URL) : false;

console.log("\nPROXIMA setup check\n");
console.log("1) Settings in .env.local");

if (!env.DATABASE_URL)
  bad("DATABASE_URL is missing", "Neon → Connect → pooling ON → copy (docs/ACCOUNTS.md section A, step 5)");
else if (!pg.test(env.DATABASE_URL)) bad("DATABASE_URL should start with postgresql://");
else if (localDb) ok("DATABASE_URL (local Postgres on this computer)");
else if (!env.DATABASE_URL.includes("-pooler"))
  bad(
    "DATABASE_URL should be the POOLED string (contains -pooler)",
    "In Neon's Connect popup turn Connection pooling ON",
  );
else ok("DATABASE_URL (pooled)");

if (!env.DIRECT_URL)
  bad("DIRECT_URL is missing", "Neon → Connect → pooling OFF → copy (docs/ACCOUNTS.md section A, step 6)");
else if (!pg.test(env.DIRECT_URL)) bad("DIRECT_URL should start with postgresql://");
else if (localDb) ok("DIRECT_URL (local Postgres)");
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
    let query;
    let close = async () => {};
    if (localDb) {
      const { default: pgLib } = await import("pg");
      const client = new pgLib.Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      query = async (text) => (await client.query(text)).rows;
      close = () => client.end();
    } else {
      const { neon } = await import("@neondatabase/serverless");
      const sql = neon(env.DATABASE_URL);
      query = (text) => sql.query(text);
    }
    const started = Date.now();
    await query("select 1");
    ok(`Connected to ${localDb ? "local Postgres" : "Neon"} (${Date.now() - started} ms)`);

    console.log("\n3) Database tables");
    const [row] = await query(
      `select to_regclass('public."User"') as users, to_regclass('public."Conversation"') as convos`,
    );
    await close();
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

console.log("\n4) AI engine");
const provider = env.AI_PROVIDER || "sujan-core";
if (provider === "mock") {
  info("AI_PROVIDER=mock — using the fake offline AI (fine for development)");
} else if (provider !== "sujan-core") {
  bad(
    `AI_PROVIDER "${provider}" is unknown`,
    'Use "sujan-core" (real) or "mock" (offline), or leave it empty',
  );
} else {
  const url = env.AI_API_URL || "https://sujancoreapi.onrender.com/chat";
  try {
    new URL(url);
    info(`Calling ${url} (a sleeping Render server can take up to 60 s)…`);
    const started = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ping", session_id: "proxima-setup-check" }),
      signal: AbortSignal.timeout(75_000),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body && typeof body.reply === "string")
      ok(`AI engine answered (${Date.now() - started} ms)`);
    else bad(`AI engine answered with HTTP ${res.status} but not the expected { reply }`, "Check AI_API_URL");
  } catch (error) {
    bad(
      `AI engine not reachable: ${error.name === "TimeoutError" ? "timed out" : error.message}`,
      "Check AI_API_URL, or set AI_PROVIDER=mock to develop offline",
    );
  }
}

console.log("");
if (failures) {
  console.log(`\x1b[31m${failures} problem(s) found.\x1b[0m Fix them in .env.local, then run this again.\n`);
  process.exit(1);
}
console.log("\x1b[32mAll good! Run `npm run dev` and open http://localhost:3000/login\x1b[0m\n");
