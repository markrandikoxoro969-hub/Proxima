#!/usr/bin/env node
/**
 * Database migrations before a build:   npm run db:deploy
 * On Vercel this runs automatically at the start of `npm run vercel-build`.
 *
 * Why this file exists: `prisma migrate deploy` on its own gives a confusing
 * error when DATABASE_URL / DIRECT_URL are missing on the server:
 *
 *     Can't reach database server at `not-set:5432`
 *
 * That "not-set" is Prisma's placeholder, not your database. This script checks
 * the settings first, says exactly what to paste where, and only then calls
 * Prisma. It also tells you when the URL is the pooled one (migrations need the
 * direct one).
 *
 * Escape hatch: set SKIP_DB_MIGRATE=1 to build without touching the database
 * (useful when you run migrations by hand).
 */
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

// On your computer: read the same files Next.js and Prisma read.
// On Vercel the variables already exist, so these do nothing.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

const onVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;

/** Same cleanup the app does: quotes, spaces, a pasted "DATABASE_URL=" prefix. */
function clean(raw) {
  if (!raw) return "";
  let value = raw.trim();
  if (value.startsWith("DATABASE_URL=") || value.startsWith("DIRECT_URL=")) {
    value = value.slice(value.indexOf("=") + 1).trim();
  }
  while (value.length >= 2 && /^(["'`])[\s\S]*\1$/.test(value)) value = value.slice(1, -1).trim();
  return value.replace(/\\_/g, "_").replace(/&amp;/g, "&");
}

const direct = clean(process.env.DIRECT_URL);
const pooled = clean(process.env.DATABASE_URL);
const url = direct || pooled;

const looksPlaceholder = (value) => !value || /not-set|\bplaceholder\b|CHANGE_ME/i.test(value);
const looksPostgres = (value) => /^postgres(ql)?:\/\//.test(value);

function explainFix() {
  console.log("");
  console.log(red("✗ The database is not configured, so migrations can't run."));
  console.log("");
  if (onVercel) {
    console.log("Fix it in Vercel (2 minutes):");
    console.log("  1. Open your project → Settings → Environment Variables.");
    console.log("  2. Add BOTH of these, copying from Neon → Connect:");
    console.log("       DATABASE_URL  = the string WITH \"-pooler\"     (the site uses this)");
    console.log("       DIRECT_URL    = the string WITHOUT \"-pooler\"  (migrations use this)");
    console.log("  3. Tick all three boxes at the bottom: Production, Preview, Development.");
    console.log("");
    console.log("     Preview matters: a deploy of a branch (like this one) is a Preview");
    console.log("     deploy and only sees Preview variables.");
    console.log("");
    console.log("  4. Deployments → newest → ⋯ → Redeploy.");
    console.log("");
    console.log(dim("  If you pasted the variables earlier, check the environment boxes and the"));
    console.log(dim("  spelling (DATABASE_URL, not DATABASE_URI or POSTGRES_URL)."));
    console.log("");
    console.log(`  ${yellow("Skip for now:")} set SKIP_DB_MIGRATE=1 in the build environment.`);
    console.log(dim("  The site will load, but login and chats won't work until the settings are added."));
  } else {
    console.log("Fix it on your computer:");
    console.log("  1. Open .env.local in the project folder.");
    console.log("  2. Paste both strings from Neon → Connect:");
    console.log("       DATABASE_URL  = the string WITH \"-pooler\"     (the site uses this)");
    console.log("       DIRECT_URL    = the string WITHOUT \"-pooler\"  (migrations use this)");
    console.log("  3. Run: npm run env:check     (it checks both strings for you)");
    console.log("  4. Run: npm run db:deploy");
    console.log("");
    console.log(dim("  No database yet? Follow docs/ACCOUNTS.md → A, then come back."));
  }
  console.log("");
}

if (looksPlaceholder(url)) {
  if (process.env.SKIP_DB_MIGRATE === "1" || process.env.SKIP_DB_MIGRATE === "true") {
    console.log(yellow("• SKIP_DB_MIGRATE is on — skipping database migrations."));
    console.log(dim("  The site will deploy, but anything that reads the database will fail until"));
    console.log(dim("  DATABASE_URL and DIRECT_URL are set."));
    process.exit(0);
  }
  /*
   * Preview deployments of a branch only see the Preview environment variables.
   * Many projects (including this one) keep the database settings on Production
   * only, so a feature branch would otherwise never get a build to review. Skip
   * the migration on Preview, but still fail Production loudly: shipping a
   * production build against a missing database is not something to paper over.
   */
  if (process.env.VERCEL_ENV === "preview") {
    console.log(yellow("• No database configured for this Preview deployment — skipping migrations."));
    console.log(dim("  The build can still be reviewed; login and chats need DATABASE_URL and"));
    console.log(dim("  DIRECT_URL in the Preview environment. Production builds still fail without them."));
    process.exit(0);
  }
  explainFix();
  process.exit(1);
}

if (!looksPostgres(url)) {
  console.log(red("✗ The database address doesn't start with postgresql://"));
  console.log(dim(`  It starts with: ${url.slice(0, 12)}…`));
  console.log("");
  console.log("  Copy the whole string from Neon → Connect → Connection string.");
  console.log("  A complete one looks like:");
  console.log(dim("  postgresql://user:password@ep-cool-name-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"));
  console.log("");
  process.exit(1);
}

// Migrations open one long-lived connection, so Neon's pooled endpoint can
// refuse or misbehave. Warn loudly but still try (some setups are fine).
try {
  const host = new URL(url).hostname;
  if (host.includes("-pooler") && !direct) {
    console.log(yellow("• DIRECT_URL is not set, so migrations will use the pooled DATABASE_URL."));
    console.log(dim("  Add DIRECT_URL (the Neon string without \"-pooler\") if migrations hang or fail."));
  }
} catch {
  /* URL parsing already succeeded above in practice; Prisma will explain the rest. */
}

console.log(green("• Applying database migrations…"));
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

if (result.error) {
  console.log(red(`✗ Could not start Prisma: ${result.error.message}`));
  process.exit(1);
}

if (result.status !== 0) {
  console.log("");
  console.log(red("✗ Migrations failed. Common causes:"));
  console.log("  • The Neon project is suspended or the password was reset → copy fresh strings.");
  console.log("  • DIRECT_URL points at the -pooler host → use the direct host instead.");
  console.log("  • The database was deleted → create a new one and paste its strings.");
  console.log(dim("  Full guide: docs/DATABASE.md → Troubleshooting"));
  console.log("");
  process.exit(result.status ?? 1);
}

console.log(green("• Database is up to date."));
