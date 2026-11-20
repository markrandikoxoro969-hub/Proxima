/**
 * Voice helpers shared by the speaker UI and the speech-synthesis hook.
 *
 * Browsers expose `SpeechSynthesisVoice` objects but no gender field. We keep a
 * small, deliberately conservative name list (the names used by Chrome, Edge,
 * Safari, Android and Windows voices) plus a pitch difference, and fall back to
 * the best voice in the user's language when nothing matches.
 *
 * Pure functions only — no `window` access — so they can be unit-tested.
 */

export const VOICE_CHOICES = ["girl", "boy"] as const;
export type VoiceChoice = (typeof VOICE_CHOICES)[number];

export type VoiceProfile = {
  id: VoiceChoice;
  /** Menu label. */
  label: string;
  /** One line under the label. */
  hint: string;
  /** Synthesis pitch (1 = the voice's natural pitch). */
  pitch: number;
};

export const VOICE_PROFILES: Record<VoiceChoice, VoiceProfile> = {
  girl: { id: "girl", label: "Girl voice", hint: "Brighter and warmer", pitch: 1.16 },
  boy: { id: "boy", label: "Boy voice", hint: "Lower and calmer", pitch: 0.9 },
};

export const VOICE_SPEEDS = [0.9, 1, 1.1] as const;

export function isVoiceChoice(value: unknown): value is VoiceChoice {
  return value === "girl" || value === "boy";
}

const FEMALE_HINTS =
  /\b(female|woman|samantha|victoria|karen|moira|tessa|fiona|serena|zira|aria|jenny|sonia|libby|natasha|clara|ava|allison|susan|emma|salli|joanna|amy|nicole|olivia|google us english|google uk english female)\b/i;
const MALE_HINTS =
  /\b(male|man|daniel|alex|fred|tom|david|mark|george|james|ryan|guy|oliver|arthur|aaron|joe|matthew|brian|russell|google uk english male)\b/i;

type VoiceLike = Pick<SpeechSynthesisVoice, "name" | "lang" | "localService">;

const baseLang = (lang: string) => lang.toLowerCase().split("-")[0] ?? "en";

function genderScore(voice: VoiceLike, choice: VoiceChoice): number {
  const name = voice.name;
  const female = FEMALE_HINTS.test(name);
  const male = MALE_HINTS.test(name);
  if (choice === "girl") return female ? 2 : male ? -2 : 0;
  return male ? 2 : female ? -2 : 0;
}

/**
 * Picks the most suitable installed voice for a language and voice choice.
 * Returns null when the browser has no voice that speaks the language, in which
 * case the caller lets the browser use its default voice.
 */
export function pickVoice<T extends VoiceLike>(
  voices: readonly T[],
  choice: VoiceChoice,
  lang = "en-US",
): T | null {
  if (voices.length === 0) return null;
  const wanted = (lang || "en-US").toLowerCase();
  const wantedBase = baseLang(wanted);

  let best: T | null = null;
  let bestScore = -Infinity;
  let genderMatch = false;
  const sameLanguage: T[] = [];
  for (const voice of voices) {
    const voiceLang = (voice.lang || "").toLowerCase();
    const languageScore = voiceLang === wanted ? 4 : baseLang(voiceLang) === wantedBase ? 3 : 0;
    // A wrong-language voice is worse than using the browser default.
    if (languageScore === 0) continue;
    sameLanguage.push(voice);
    const gender = genderScore(voice, choice);
    if (gender > 0) genderMatch = true;
    const score =
      languageScore +
      gender +
      // Prefer on-device voices: they work offline and don't send text to a vendor.
      (voice.localService ? 0.5 : 0);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }

  // Many Android/Windows voices have no gendered name at all. Give the two
  // choices genuinely different voices where the device has more than one,
  // then let the pitch difference finish the job.
  if (!genderMatch && sameLanguage.length > 1) {
    const ordered = [...sameLanguage].sort((a, b) => Number(b.localService) - Number(a.localService));
    return ordered[choice === "girl" ? 0 : Math.min(1, ordered.length - 1)] ?? best;
  }
  return best;
}

/** Removes Markdown so a screen reader doesn't spell out stars, pipes and URLs. */
export function toSpeechText(markdown: string): string {
  let text = (markdown || "").replace(/\r\n?/g, "\n");
  // Code blocks are visual; reading them aloud is unhelpful. Keep a marker so
  // the listener knows something was on screen.
  text = text.replace(/```[\s\S]*?```/g, " Code block. ");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/^\s{0,3}#{1,6}\s*/gm, "");
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  text = text.replace(/^\s{0,3}(?:[-*+]|\d+[.)]|[A-Za-z][.)])\s+/gm, "");
  // Tables: drop the |---| separator rows and read each row as a comma list.
  text = text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed.includes("|")) return line;
      if (/^[|\s:.-]+$/.test(trimmed)) return "";
      return trimmed
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(", ");
    })
    .join("\n");
  text = text.replace(/[*_~]{1,3}/g, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/**
 * Splits text into utterance-sized chunks. Long single utterances are cut off
 * or stalled by some browsers; sentences are a natural, pause-friendly boundary.
 */
export function splitForSpeech(text: string, maxChars = 180): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const pieces = clean.match(/[^.!?…]+[.!?…]+["')\]]*|[^.!?…]+$/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = "";
  };

  for (const piece of pieces) {
    const sentence = piece.trim();
    if (!sentence) continue;
    if (sentence.length > maxChars) {
      push();
      // A single huge sentence (often a URL or code name): split at words first.
      let rest = sentence;
      while (rest.length > maxChars) {
        const slice = rest.slice(0, maxChars);
        const at = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf(","));
        const cut = at > maxChars * 0.6 ? at + 1 : maxChars;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest) current = rest;
      continue;
    }
    if ((current + " " + sentence).trim().length > maxChars) push();
    current = current ? `${current} ${sentence}` : sentence;
  }
  push();
  return chunks;
}
