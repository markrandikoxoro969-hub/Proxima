/**
 * ─── Chat typing-box memes & companion triggers ───
 *
 * Pure helpers (no DOM, no React) that match playful chat typing moments to
 * the user's meme overlays (`skull.png`, `wasted.png`) and peeking companion
 * (`peeker.png`).
 */

export type ComposerMemeKind = "skull" | "wasted";

export type ComposerMemeSpec = {
  id: ComposerMemeKind;
  label: string;
  src: string;
  alt: string;
  hint: string;
  captions: readonly string[];
  durationMs: number;
};

export const COMPOSER_MEMES: Record<ComposerMemeKind, ComposerMemeSpec> = {
  skull: {
    id: "skull",
    label: "Deadass Skull",
    src: "/media/memes/skull.png",
    alt: "Glowing red-eye skull meme",
    hint: "Triggers on bruh, cooked, deadass, wtf, 💀…",
    captions: ["nah bro…", "ain't no way", "bro is cooked", "deadass??", "wild take"],
    durationMs: 2500,
  },
  wasted: {
    id: "wasted",
    label: "Wasted",
    src: "/media/memes/wasted.png",
    alt: "Wasted meme overlay",
    hint: "Triggers on wasted, rip, crash, failed, gg…",
    captions: ["MISSION FAILED", "CRITICAL HIT", "RESPAWNING…", "TRY AGAIN"],
    durationMs: 2600,
  },
};

export const PEEKER_ASSET = {
  src: "/media/memes/peeker.png",
  alt: "Anime companion peeking over the message box",
  idleQuips: [
    "what are we cooking?",
    "ooh, tell me more~",
    "ready when you are ✨",
    "drop the prompt!",
  ],
  typingQuips: [
    "oooh interesting…",
    "cooking something good!",
    "keep going, I'm watching 👀",
    "let's send it!",
  ],
  streamingQuips: [
    "thinking really hard…",
    "here comes the answer ✨",
    "almost there~",
  ],
} as const;

const WASTED_PATTERN =
  /\b(wasted|rip|gg|oof|crash(?:ed|ing)?|fatal|give up|i'?m done|done for|mission failed|destroyed|ruined|404|500|delete everything|broke it|failed|panic)\b/i;

const SKULL_PATTERN =
  /(?:💀|☠️?|\b(?:bruh+|bro+|nah+|deadass|cooked|skull|lmao+|lmfao+|wtf|no way|ain'?t no way|aint no way|sus|fr fr|crazy|wild|hell naw|bozo|bug(?:ged|ging)?)\b)/i;

export type DetectedMeme = {
  kind: ComposerMemeKind;
  matched: string;
  caption: string;
};

function pickFrom<T>(items: readonly T[], seed: number): T {
  const index = Math.abs(seed) % items.length;
  return items[index]!;
}

/**
 * Inspects the end of the user's current draft (last ~60 chars) so only fresh
 * words trigger a meme pop. Returns null when nothing matches.
 */
export function detectComposerMeme(text: string): DetectedMeme | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const tail = trimmed.slice(-64);

  const wasted = WASTED_PATTERN.exec(tail);
  const skull = SKULL_PATTERN.exec(tail);

  if (!wasted && !skull) return null;

  // Prefer whichever keyword appeared closer to the end of what the user typed.
  const wastedEnd = wasted ? wasted.index + wasted[0].length : -1;
  const skullEnd = skull ? skull.index + skull[0].length : -1;
  const kind: ComposerMemeKind = wastedEnd >= skullEnd ? "wasted" : "skull";
  const matched = (kind === "wasted" ? wasted![0] : skull![0]).toLowerCase();
  const captions = COMPOSER_MEMES[kind].captions;

  return {
    kind,
    matched,
    caption: pickFrom(captions, trimmed.length + matched.charCodeAt(0)),
  };
}

export function pickPeekerQuip(state: "idle" | "typing" | "streaming", count: number): string {
  const list =
    state === "streaming"
      ? PEEKER_ASSET.streamingQuips
      : state === "typing"
        ? PEEKER_ASSET.typingQuips
        : PEEKER_ASSET.idleQuips;
  return pickFrom(list, count);
}
