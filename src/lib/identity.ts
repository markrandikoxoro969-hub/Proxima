import "server-only";
import { identityConfig } from "@/config/identity";

/**
 * Detects identity questions ("who made you?", "how old are you?") and
 * answers them from src/config/identity.ts without calling the AI.
 *
 * Fix vs. the original file: the old developer pattern matched ANY sentence
 * with "what"/"who" before "you" — e.g. "What can you do?" or "What do you
 * think about cats?" wrongly got the developer answer. These patterns only
 * match real questions about Proxima's creator, age, gender or identity.
 */

const SUBJECT = String.raw`(?:you|u|proxima|this (?:app|bot|ai|assistant))`;
const CREATED = String.raw`(?:made|created|built|developed|programmed|designed|coded|wrote|trained|owns?)`;
const ROLE = String.raw`(?:developers?|devs?|creators?|makers?|owners?|masters?|boss(?:es)?|designers?|architects?|programmers?|authors?)`;

const DEVELOPER_PATTERNS = [
  // "who made you", "who created proxima", "which company built you"
  new RegExp(
    String.raw`\b(?:who|which (?:company|person|team))\b[^?.!]{0,30}\b${CREATED}\b[^?.!]{0,15}\b${SUBJECT}\b`,
    "i",
  ),
  // "who is your developer", "your creator?", "proxima's owner"
  new RegExp(String.raw`\b(?:your|proxima'?s)\s+(?:lead\s+|main\s+)?${ROLE}\b`, "i"),
  // "who is the developer of proxima"
  new RegExp(
    String.raw`\b(?:who|what)\b[^?.!]{0,20}\b${ROLE}\b[^?.!]{0,10}\b(?:of|behind|for)\s+${SUBJECT}\b`,
    "i",
  ),
  // "were you made by google?", "are you built by openai"
  new RegExp(String.raw`\b(?:were|are)\s+you\s+${CREATED}\s+by\b`, "i"),
  // "who is sujan", "who is aayusha"
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

/** "4 days old", "1 day old", "3 months old" … counted from identityConfig.bornOn. */
export function describeAge(now: Date = new Date()): string {
  const born = new Date(`${identityConfig.bornOn}T00:00:00Z`);
  const days = Math.max(0, Math.floor((now.getTime() - born.getTime()) / 86_400_000));
  if (days < 60) return `${days} ${days === 1 ? "day" : "days"} old`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} months old`;
  return `${Math.floor(months / 12)} years old`;
}

const matches = (patterns: RegExp[], text: string) => patterns.some((p) => p.test(text));

/**
 * Returns a ready-made answer if the message is an identity question, else null.
 * Order matters: specific questions (developer/age/gender) before generic "who are you".
 */
export function getIdentityAnswer(message: string, now: Date = new Date()): string | null {
  const text = message.trim().slice(0, 300); // identity questions are short
  if (!text) return null;
  if (matches(DEVELOPER_PATTERNS, text)) return fill(identityConfig.answers.developer);
  if (matches(AGE_PATTERNS, text)) return fill(identityConfig.answers.age, { age: describeAge(now) });
  if (matches(GENDER_PATTERNS, text)) return fill(identityConfig.answers.gender);
  if (matches(WHO_ARE_YOU_PATTERNS, text)) return fill(identityConfig.answers.whoAreYou);
  return null;
}

/** Replaces accidental "I'm trained by Google" style phrases in AI replies. */
export function cleanIdentityLeaks(text: string): string {
  let cleaned = text;
  for (const { pattern, replacement } of identityConfig.leakReplacements) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned;
}
