/**
 * ─── Chat typing-box memes & companion catalog ───
 *
 * Pure helpers (no DOM, no React) that match playful chat typing moments to
 * the user's meme overlays (`skull.png`, `wasted.png`) and the 7 selectable
 * anime companions (`ledge-peeker.png`, `manga-peeker.png`, `chibi-anya.png`,
 * `chibi-gojo.png`, `chibi-ayanokoji.png`, `chibi-kanna.png`, `peeker.png`).
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

export type PeekerAnchor = "ledge" | "chibi" | "screen-right";

export type PeekerCompanionId =
  | "ledge-peeker"
  | "manga-peeker"
  | "chibi-anya"
  | "chibi-gojo"
  | "chibi-ayanokoji"
  | "chibi-kanna"
  | "peeker";

export type PeekerCompanion = {
  id: PeekerCompanionId;
  label: string;
  src: string;
  alt: string;
  anchor: PeekerAnchor;
  width: number;
  height: number;
};

export const DEFAULT_PEEKER_ID: PeekerCompanionId = "ledge-peeker";

export const PEEKER_COMPANIONS: readonly PeekerCompanion[] = [
  {
    id: "ledge-peeker",
    label: "Ledge",
    src: "/media/memes/ledge-peeker.png",
    alt: "Manga girl peeking over the typing box rim",
    anchor: "ledge",
    width: 148,
    height: 96,
  },
  {
    id: "manga-peeker",
    label: "Rift",
    src: "/media/memes/manga-peeker.png",
    alt: "Manga girl peeking through a torn paper rift",
    anchor: "chibi",
    width: 108,
    height: 86,
  },
  {
    id: "chibi-anya",
    label: "Anya",
    src: "/media/memes/chibi-anya.png",
    alt: "Chibi Anya peeking curiously",
    anchor: "chibi",
    width: 84,
    height: 76,
  },
  {
    id: "chibi-gojo",
    label: "Gojo",
    src: "/media/memes/chibi-gojo.png",
    alt: "Chibi Gojo holding taiyaki",
    anchor: "chibi",
    width: 78,
    height: 86,
  },
  {
    id: "chibi-ayanokoji",
    label: "Kiyo",
    src: "/media/memes/chibi-ayanokoji.png",
    alt: "Chibi Ayanokoji resting his chin",
    anchor: "chibi",
    width: 80,
    height: 86,
  },
  {
    id: "chibi-kanna",
    label: "Kanna",
    src: "/media/memes/chibi-kanna.png",
    alt: "Chibi Kanna cheering",
    anchor: "chibi",
    width: 60,
    height: 88,
  },
  {
    id: "peeker",
    label: "Wall",
    src: "/media/memes/peeker.png",
    alt: "Anime girl peeking from the right edge of the screen",
    anchor: "screen-right",
    width: 68,
    height: 170,
  },
] as const;

const COMPANION_BY_ID = new Map<string, PeekerCompanion>(
  PEEKER_COMPANIONS.map((item) => [item.id, item]),
);

export function getPeekerCompanion(id: string | null | undefined): PeekerCompanion {
  return (id && COMPANION_BY_ID.get(id)) || PEEKER_COMPANIONS[0]!;
}

export function isPeekerCompanionId(id: unknown): id is PeekerCompanionId {
  return typeof id === "string" && COMPANION_BY_ID.has(id);
}

export const PEEKER_ASSET = {
  src: PEEKER_COMPANIONS[0]!.src,
  alt: PEEKER_COMPANIONS[0]!.alt,
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
