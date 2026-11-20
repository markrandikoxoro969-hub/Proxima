#!/usr/bin/env node
/**
 * Setup helper:   npm run env:setup
 *
 * Asks for each key one by one (just paste and press Enter), checks it,
 * makes AUTH_SECRET for you, and writes .env.local.
 *   • Already have a .env.local? Press Enter to keep the current value.
 *     The old file is saved as .env.local.backup first.
 *   • Nothing is sent anywhere: the file stays on your computer and is never committed.
 */
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parse } from "dotenv";

const FILE = ".env.local";
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const grey = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const current = existsSync(FILE) ? parse(readFileSync(FILE)) : {};

/** Accept what people really paste: quotes, `KEY=value`, or Neon's `psql 'postgresql://…'`. */
function clean(raw, key) {
  let v = raw.trim();
  if (key && v.startsWith(`${key}=`)) v = v.slice(key.length + 1).trim();
  if (v.startsWith("psql ")) v = v.slice(5).trim();
  v = v.replace(/^["'`]+|["'`]+$/g, "").trim();
  return v;
}

const isPg = (v) => /^postgres(ql)?:\/\/.+@.+/.test(v);
const isLocalDb = (v) => /@(localhost|127\.0\.0\.1)[:/]/.test(v);
const hide = (v) => (v.length > 16 ? `${v.slice(0, 10)}…${v.slice(-4)}` : "•".repeat(v.length));
const hideUrl = (v) => v.replace(/(:\/\/[^:]+:)[^@]+@/, "$1••••@");

const questions = [
  {
    key: "DATABASE_URL",
    title: "Neon POOLED connection string",
    where: "Neon → your project → Connect → Connection pooling ON → copy",
    check: (v) =>
      !isPg(v)
        ? "It should start with postgresql:// and contain an @"
        : !isLocalDb(v) && !v.includes("-pooler")
          ? "This is the direct string. Turn Connection pooling ON and copy again (it contains -pooler)"
          : null,
    show: hideUrl,
  },
  {
    key: "DIRECT_URL",
    title: "Neon DIRECT connection string",
    where:
      "Same popup → Connection pooling OFF → copy (no -pooler). Press Enter to build it from the one above.",
    fallback: (a) => (a.DATABASE_URL ? a.DATABASE_URL.replace("-pooler.", ".") : ""),
    check: (v) =>
      !isPg(v)
        ? "It should start with postgresql://"
        : v.includes("-pooler")
          ? "It must NOT contain -pooler"
          : null,
    show: hideUrl,
  },
  {
    key: "AUTH_GOOGLE_ID",
    title: "Google Client ID",
    where: "Google Cloud → Google Auth Platform → Clients → Proxima Web",
    check: (v) =>
      v.endsWith(".apps.googleusercontent.com") ? null : "It should end with .apps.googleusercontent.com",
    show: (v) => v,
  },
  {
    key: "AUTH_GOOGLE_SECRET",
    title: "Google Client secret",
    where: "Same page (starts with GOCSPX-)",
    check: (v) => (v.length >= 10 ? null : "That looks too short"),
    show: hide,
  },
];

// Read lines through a buffer, so nothing is lost when several lines are pasted at once.
const rl = createInterface({ input: stdin, terminal: false });
const lines = rl[Symbol.asyncIterator]();
async function ask(prompt) {
  stdout.write(prompt);
  const { value, done } = await lines.next();
  if (done) {
    console.log(red("\n\nStopped before the end. Nothing was saved. Run  npm run env:setup  again."));
    process.exit(1);
  }
  return value;
}
const answers = {};

console.log(bold("\nPROXIMA: create .env.local\n"));
console.log(grey("Paste each value and press Enter. Quotes are fine; they're removed automatically.\n"));

for (const q of questions) {
  const old = current[q.key];
  const fallback = old || q.fallback?.(answers) || "";
  console.log(`${bold(q.title)}  ${grey(`(${q.key})`)}`);
  console.log(grey(`  ${q.where}`));
  if (fallback) console.log(grey(`  Enter = ${old ? "keep" : "use"} ${q.show(fallback)}`));
  for (;;) {
    const value = clean(await ask("  > "), q.key) || fallback;
    const problem = value ? q.check(value) : "This one is required";
    if (!problem) {
      answers[q.key] = value;
      console.log(green("  ✓ ok\n"));
      break;
    }
    console.log(red(`  ✗ ${problem}. Try again.`));
  }
}

const secret = current.AUTH_SECRET && current.AUTH_SECRET.length >= 32 ? current.AUTH_SECRET : null;
answers.AUTH_SECRET = secret || randomBytes(32).toString("base64");
console.log(green(`✓ AUTH_SECRET ${secret ? "kept" : "created for you"}\n`));

const real = (
  await ask(`Use the real PROXIMA AI? ${grey("(Y = real, n = fake offline AI for design work)")} `)
)
  .trim()
  .toLowerCase();
answers.AI_PROVIDER = real === "n" || real === "no" ? "mock" : "sujan-core";
rl.close();

// Keep any extra keys the old file had (e.g. Resend), so nothing is lost.
const known = new Set(["NEXT_PUBLIC_SITE_URL", "AUTH_SECRET", "AI_PROVIDER", ...questions.map((q) => q.key)]);
const extras = Object.entries(current).filter(([k]) => !known.has(k));

const q = (v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const content = `# PROXIMA local settings. Made by "npm run env:setup" on ${new Date().toISOString().slice(0, 10)}.
# SECRET: never share this file or commit it (git already ignores it).

NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Database (Neon)
DATABASE_URL=${q(answers.DATABASE_URL)}
DIRECT_URL=${q(answers.DIRECT_URL)}

# Login (Auth.js + Google)
AUTH_SECRET=${q(answers.AUTH_SECRET)}
AUTH_GOOGLE_ID=${q(answers.AUTH_GOOGLE_ID)}
AUTH_GOOGLE_SECRET=${q(answers.AUTH_GOOGLE_SECRET)}

# AI: "sujan-core" = real PROXIMA AI, "mock" = fake offline AI
AI_PROVIDER=${q(answers.AI_PROVIDER)}
${extras.length ? `\n# Kept from your previous .env.local\n${extras.map(([k, v]) => `${k}=${q(v)}`).join("\n")}\n` : ""}`;

if (existsSync(FILE)) {
  copyFileSync(FILE, `${FILE}.backup`);
  console.log(grey(`Old file saved as ${FILE}.backup`));
}
writeFileSync(FILE, content, { mode: 0o600 });

console.log(green(bold(`\n✓ Saved ${FILE}\n`)));
console.log("Next, run these one at a time:");
console.log(bold("  npm run env:check") + grey("   checks every value and the database"));
console.log(bold("  npm run db:deploy") + grey("   creates the tables (first time only)"));
console.log(bold("  npm run dev") + grey("         then open http://localhost:3000\n"));
