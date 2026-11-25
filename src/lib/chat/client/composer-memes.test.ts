import { describe, expect, it } from "vitest";
import {
  COMPOSER_MEMES,
  DEFAULT_PEEKER_ID,
  PEEKER_COMPANIONS,
  detectComposerMeme,
  getPeekerCompanion,
  isPeekerCompanionId,
  pickPeekerQuip,
} from "./composer-memes";

describe("detectComposerMeme", () => {
  it("returns null for ordinary prompts", () => {
    expect(detectComposerMeme("")).toBeNull();
    expect(detectComposerMeme("Explain quantum tunneling simply")).toBeNull();
    // Must not falsely match substrings like 'onerror' or 'progress'
    expect(detectComposerMeme("<img src=x onerror=alert(1)>")).toBeNull();
  });

  it("matches skull slang and emoji", () => {
    expect(detectComposerMeme("bruh why is css like this")?.kind).toBe("skull");
    expect(detectComposerMeme("we are so cooked")?.kind).toBe("skull");
    expect(detectComposerMeme("aint no way 💀")?.kind).toBe("skull");
  });

  it("matches wasted keywords", () => {
    expect(detectComposerMeme("my server just crashed")?.kind).toBe("wasted");
    expect(detectComposerMeme("wasted my whole afternoon")?.kind).toBe("wasted");
    expect(detectComposerMeme("rip production build")?.kind).toBe("wasted");
  });

  it("picks whichever trigger appeared closer to the end of the draft", () => {
    expect(detectComposerMeme("bruh my app just crashed")?.kind).toBe("wasted");
    expect(detectComposerMeme("it crashed lol bruh")?.kind).toBe("skull");
  });

  it("supplies valid meme assets, companions, and peeker quips", () => {
    expect(COMPOSER_MEMES.skull.src).toBe("/media/memes/skull.png");
    expect(COMPOSER_MEMES.wasted.src).toBe("/media/memes/wasted.png");
    expect(PEEKER_COMPANIONS.length).toBe(7);
    expect(getPeekerCompanion(undefined).id).toBe(DEFAULT_PEEKER_ID);
    expect(getPeekerCompanion("chibi-gojo").src).toBe("/media/memes/chibi-gojo.png");
    expect(getPeekerCompanion("peeker").anchor).toBe("screen-right");
    expect(isPeekerCompanionId("chibi-anya")).toBe(true);
    expect(isPeekerCompanionId("nonexistent")).toBe(false);
    expect(pickPeekerQuip("idle", 0)).toBeTruthy();
    expect(pickPeekerQuip("typing", 1)).toBeTruthy();
    expect(pickPeekerQuip("streaming", 2)).toBeTruthy();
  });
});
