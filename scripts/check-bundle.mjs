#!/usr/bin/env node
/**
 * Bundle-size check — run AFTER `npm run build`:
 *     npm run check:bundle
 *
 * For every page it adds up the JavaScript the browser downloads on first
 * load (gzip size, like the network tab shows) and compares it to the
 * budgets in bundle-budget.json. Exits with an error if a page is too big,
 * so CI / Vercel can block a slow release.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";
import vm from "node:vm";

const root = process.cwd();
const nextDir = join(root, ".next");
const budgets = JSON.parse(readFileSync(join(root, "bundle-budget.json"), "utf8"));

if (!existsSync(join(nextDir, "build-manifest.json"))) {
  console.error("✖ No build found. Run `npm run build` first.");
  process.exit(1);
}

const buildManifest = JSON.parse(readFileSync(join(nextDir, "build-manifest.json"), "utf8"));
const shared = buildManifest.rootMainFiles ?? [];

const sizeCache = new Map();
function gzipKb(file) {
  const clean = file.replace(/^\/?_next\//, "");
  if (!sizeCache.has(clean)) {
    const full = join(nextDir, clean);
    sizeCache.set(clean, existsSync(full) ? gzipSync(readFileSync(full), { level: 9 }).length / 1024 : 0);
  }
  return sizeCache.get(clean);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith("_client-reference-manifest.js")) out.push(full);
  }
  return out;
}

const appDir = join(nextDir, "server", "app");
const rows = [];
for (const file of walk(appDir)) {
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(file, "utf8"), sandbox);
  for (const [key, manifest] of Object.entries(sandbox.__RSC_MANIFEST ?? {})) {
    // key looks like "/page", "/app/page", "/api/chat/route"
    if (!key.endsWith("/page")) continue;
    const route = key.replace(/\/page$/, "") || "/";
    if (route.startsWith("/_")) continue; // internal pages
    const files = new Set(shared);
    for (const [entry, list] of Object.entries(manifest.entryJSFiles ?? {})) {
      // The 404 page and the last-resort error screen only download when they're shown,
      // so they don't count toward a normal page's first load.
      if (/\/(not-found|global-error)$/.test(entry)) continue;
      list.forEach((f) => files.add(f));
    }
    const kb = [...files].reduce((sum, f) => sum + gzipKb(f), 0);
    const budget = budgets.routes?.[route] ?? budgets.default;
    rows.push({ route, kb, budget, file: relative(root, file).split(sep).join("/") });
  }
}

rows.sort((a, b) => a.route.localeCompare(b.route));
let failed = 0;
console.log("\nFirst-load JavaScript per page (gzip):\n");
for (const r of rows) {
  const ok = r.kb <= r.budget;
  if (!ok) failed++;
  const bar = "█".repeat(Math.min(40, Math.round((r.kb / r.budget) * 20)));
  console.log(
    `${ok ? "✓" : "✖"} ${r.route.padEnd(24)} ${r.kb.toFixed(1).padStart(7)} KB / ${String(r.budget).padStart(3)} KB  ${bar}`,
  );
}
console.log("");
if (failed) {
  console.error(
    `✖ ${failed} page(s) over budget. Lazy-load heavy parts or raise the budget in bundle-budget.json.`,
  );
  process.exit(1);
}
console.log("✓ All pages within budget.");
