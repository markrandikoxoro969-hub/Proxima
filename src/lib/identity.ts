import "server-only";
import { identityConfig } from "@/config/identity";

/**
 * Proxima identity helpers:
 * - Computes Proxima's live ticking age (6 months + live days/hours/minutes/seconds from bornOn).
 * - Builds the live identity prompt section so the AI answers naturally in her own voice
 *   (no stiff canned/saved replies) while keeping every fact accurate.
 * - Sanitizes accidental third-party model identity leaks.
 */

const SUBJECT = String.raw`(?:you|u|proxima|this (?:app|bot|ai|assistant))`;
const CREATED = String.raw`(?:made|created|built|developed|programmed|designed|coded|wrote|trained|owns?)`;
const ROLE = String.raw`(?:developers?|devs?|creators?|makers?|owners?|masters?|boss(?:es)?|designers?|architects?|programmers?|authors?)`;

const DEVELOPER_PATTERNS = [
  new RegExp(
    String.raw`\b(?:who|which (?:company|person|team))\b[^?.!]{0,30}\b${CREATED}\b[^?.!]{0,15}\b${SUBJECT}\b`,
    "i",
  ),
  new RegExp(String.raw`\b(?:your|proxima'?s)\s+(?:lead\s+|main\s+)?${ROLE}\b`, "i"),
  new RegExp(
    String.raw`\b(?:who|what)\b[^?.!]{0,20}\b${ROLE}\b[^?.!]{0,10}\b(?:of|behind|for)\s+${SUBJECT}\b`,
    "i",
  ),
  new RegExp(String.raw`\b(?:were|are)\s+you\s+${CREATED}\s+by\b`, "i"),
  /\bwho\s+(?:is|'s)\s+(?:sujan|aayusha)\b/i,
];

const AGE_PATTERNS = [
  new RegExp(String.raw`\bhow old\s+(?:are|is)\s+${SUBJECT}\b`, "i"),
  /\b(?:your|proxima'?s)\s+age\b/i,
  /\bage of proxima\b/i,
  new RegExp(String.raw`\bwhen\s+(?:were|was)\s+${SUBJECT}\s+(?:born|created|made|launched)\b`, "i"),
];

const GENDER_PATTERNS = [
  /\b(?:your|proxima'?s)\s+gender\b/i,
  /\bwhat\s+gender\b[^?.!]{0,15}\b(?:you|proxima)\b/i,
  /\bare\s+you\s+(?:a\s+)?(?:female|male|girl|boy|woman|man|guy|lady)\b/i,
];

const WHO_ARE_YOU_PATTERNS = [
  new RegExp(String.raw`\b(?:who|what)\s+(?:are|is)\s+${SUBJECT}\s*[?.!]*\s*$`, "i"),
  /\b(?:tell me about yourself|introduce yourself)\b/i,
  /\bwhat(?:'s| is)\s+your\s+name\b/i,
];

function fill(template: string, extra: Record<string, string> = {}): string {
  const values: Record<string, string> = {
    name: identityConfig.name,
    version: identityConfig.version,
    lead: identityConfig.developers.lead,
    support: identityConfig.developers.support,
    facebookUrl: identityConfig.facebookUrl,
    ...extra,
  };
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/**
 * Computes Proxima's live ticking age from `identityConfig.bornOn` (starts at 6 months on 2026-11-25
 * and increments continuously in months, days, hours, minutes, seconds).
 */
export function describeAge(now: Date = new Date()): string {
  const born = new Date(identityConfig.bornOn);
  if (now.getTime() <= born.getTime()) return "0 days, 0h 0m";

  let months =
    (now.getUTCFullYear() - born.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - born.getUTCMonth());

  // Anchor at the exact month boundary; if day/time hasn't reached born's day yet, step back 1 month.
  const anchor = new Date(
    Date.UTC(
      born.getUTCFullYear(),
      born.getUTCMonth() + months,
      born.getUTCDate(),
      born.getUTCHours(),
      born.getUTCMinutes(),
      born.getUTCSeconds(),
    ),
  );
  if (anchor.getTime() > now.getTime()) {
    months -= 1;
    anchor.setUTCMonth(anchor.getUTCMonth() - 1);
  }

  const diffSec = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / 1000));
  const days = Math.floor(diffSec / 86_400);
  const hours = Math.floor((diffSec % 86_400) / 3_600);
  const minutes = Math.floor((diffSec % 3_600) / 60);

  const parts: string[] = [];
  if (months > 0) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  if (days > 0 || months === 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  parts.push(`${hours}h ${minutes}m`);
  return parts.join(", ");
}

/**
 * Live identity context injected into the AI system prompt so Proxima answers
 * questions about herself naturally and conversationally (never like a stiff saved template).
 */
export function identitySystemSection(now: Date = new Date()): string {
  return [
    "Identity (answer naturally and conversationally in your own voice if asked — never recite a rigid template):",
    `- Name: ${identityConfig.name}`,
    `- Core version: ${identityConfig.version}`,
    `- Current live age: ${describeAge(now)} (continuously counting up from launch)`,
    `- Gender: ${identityConfig.gender}`,
    `- Developers: ${identityConfig.developers.lead} (lead developer) and ${identityConfig.developers.support} (supporting developer)`,
    `- Developer contact: ${identityConfig.facebookUrl}`,
  ].join("\n");
}

const matches = (patterns: RegExp[], text: string) => patterns.some((p) => p.test(text));

/** Reference identity matcher (useful for fallback checks & tests). */
export function getIdentityAnswer(message: string, now: Date = new Date()): string | null {
  const text = message.trim().slice(0, 300);
  if (!text) return null;
  if (matches(DEVELOPER_PATTERNS, text)) return fill(identityConfig.answers.developer);
  if (matches(AGE_PATTERNS, text)) return fill(identityConfig.answers.age, { age: describeAge(now) });
  if (matches(GENDER_PATTERNS, text)) return fill(identityConfig.answers.gender);
  if (matches(WHO_ARE_YOU_PATTERNS, text)) {
    return fill(identityConfig.answers.whoAreYou, { age: describeAge(now) });
  }
  return null;
}

/** Replaces accidental third-party vendor self-descriptions in AI replies. */
export function cleanIdentityLeaks(text: string): string {
  let cleaned = text;
  for (const { pattern, replacement } of identityConfig.leakReplacements) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned;
}
