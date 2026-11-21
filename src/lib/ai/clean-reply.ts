/**
 * Removes the little pieces of "AI voice" that make an answer feel generated.
 *
 *   "Great question! Here's a quick breakdown: …"   →  "…"
 *   "… That's the whole idea. I hope this helps!"    →  "… That's the whole idea."
 *
 * Only well-known filler patterns are removed, and never if nothing would be
 * left. Everything else — including code, lists and punctuation — is untouched.
 */
import "server-only";

/** Preambles that carry no information. Matched at the very start only. */
const LEADING: RegExp[] = [
  /^(?:great|good|excellent|interesting|fantastic|awesome)\s+question[.!…,:;\u2014-]*\s*/i,
  /^(?:sure|certainly|absolutely|of course|no problem|got it|understood)[.!…,:;\u2014-]*\s*/i,
  /^(?:I(?:'d| would) be (?:happy|glad) to help(?: you)?(?: with (?:that|this))?)[.!…,:;\u2014-]*\s*/i,
  /^(?:happy to help|glad to help)[.!…,:;\u2014-]*\s*/i,
  /^here(?:'s| is|\u2019s)\s+(?:a\s+|an\s+|the\s+)?(?:quick\s+|short\s+|brief\s+|little\s+)?(?:brainstorm|breakdown|summary|overview|list|explanation|answer|draft|plan|version|walkthrough)\b[^.!?\n:]{0,60}[:.!…]\s*/i,
  /^(?:let me|I'll|I will)\s+(?:help(?: you)?(?: with that)?|walk you through(?: it)?|break (?:this|it) down(?: for you)?|explain)[.!…,:;\u2014-]*\s*/i,
  /^(?:as an AI(?: language model)?|as a language model)[^.!?\n]{0,80}[.!?]\s*/i,
];

/** Sign-offs that add nothing. Matched at the very end only. */
const TRAILING: RegExp[] = [
  /\s*(?:I hope (?:this|that) helps?[^.!?\n]*[.!?]?|hope (?:this|that) helps?[^.!?\n]*[.!?]?)$/i,
  /\s*(?:let me know if you (?:need|have) (?:anything else|any (?:more )?questions?|questions)[^.!?\n]*[.!?]?)$/i,
  /\s*(?:feel free to ask[^.!?\n]*[.!?]?|happy to help[^.!?\n]*[.!?]?)$/i,
  /\s*(?:is there anything else (?:I can help with|you(?:'d| would) like)[^.!?\n]*[.!?]?)$/i,
];

/** True when the text still says something after removing a match. */
const stillUseful = (text: string) => text.replace(/[\s.!?…,:;\u2014-]/g, "").length > 0;

/** Removes leading filler even if that empties the string (used mid-stream). */
export function stripLeadingFiller(input: string): string {
  let text = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trimStart();
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const pattern of LEADING) {
      const next = text.replace(pattern, "");
      if (next !== text) {
        text = next.trimStart();
        changed = true;
      }
    }
    if (!changed) break;
  }
  return text;
}

/**
 * Collapses the blank lines left behind by a removed preamble, but never inside
 * a fenced code block: a run of blank lines can be part of a string literal or
 * a template and must reach the user exactly as the model wrote it.
 */
function collapseBlankLinesOutsideCode(text: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  let blanks = 0;
  for (const line of text.split("\n")) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) {
        fence = null;
      }
    }
    if (fence === null && line.trim() === "") {
      blanks += 1;
      if (blanks <= 2) out.push(line);
    } else {
      blanks = 0;
      out.push(line);
    }
  }
  return out.join("\n");
}

export function stripFiller(input: string): string {
  let text = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  // Repeat a few times: "Sure! Great question! …" has two preambles.
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const pattern of LEADING) {
      const next = text.replace(pattern, "");
      if (next !== text && stillUseful(next)) {
        text = next.trimStart();
        changed = true;
      }
    }
    for (const pattern of TRAILING) {
      const next = text.replace(pattern, "");
      if (next !== text && stillUseful(next)) {
        text = next.trimEnd();
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Collapse runs of blank lines left behind by a removed preamble.
  return collapseBlankLinesOutsideCode(text).trim();
}

/**
 * Streaming helper. The first sentence can't be streamed safely (we don't know
 * yet whether it is filler), so we hold it briefly:
 *
 *   - keep the first chunk(s) until a sentence ends or a line break appears,
 *   - clean that beginning once, then let everything else pass untouched.
 *
 * Worst case we hold 320 characters, which is one short sentence — not enough
 * to feel like lag.
 */
export class LeadingCleanGate {
  private buffer = "";
  private released = false;

  constructor(private readonly maxHold = 320) {}

  /** Returns text that is safe to show now (may be empty). */
  push(chunk: string): string {
    if (!chunk) return "";
    if (this.released) return chunk;
    this.buffer += chunk;
    if (!this.isSafeBreak()) {
      if (this.buffer.length < this.maxHold) return "";
      // Too long to hold: clean what we have and carry on.
    }
    this.released = true;
    const out = stripLeadingFiller(this.buffer);
    this.buffer = "";
    return out;
  }

  /** Everything still held (call before "done"). */
  flush(): string {
    if (this.released) return "";
    this.released = true;
    const out = stripLeadingFiller(this.buffer);
    this.buffer = "";
    return out;
  }

  /** A safe break is a newline (headings, lists, code) or an end-of-sentence. */
  private isSafeBreak(): boolean {
    const text = this.buffer;
    if (!text) return false;
    if (text.includes("\n")) return true;
    return /[.!?…](?:\s|$)/.test(text);
  }
}
