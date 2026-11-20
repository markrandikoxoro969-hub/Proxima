import { describe, expect, it } from "vitest";
import { VOICE_PROFILES, isVoiceChoice, pickVoice, splitForSpeech, toSpeechText } from "./voice";

const voice = (name: string, lang: string, localService = true) => ({ name, lang, localService });

describe("toSpeechText", () => {
  it("strips markdown that should never be pronounced", () => {
    const spoken = toSpeechText(
      [
        "## Two ways",
        "Use **this** _one_ first, then read [the docs](https://example.com).",
        "- First item",
        "- Second item",
        "| Name | Time |",
        "| --- | --- |",
        "| Ada | 4s |",
        "```ts",
        "const x = 1;",
        "```",
      ].join("\n"),
    );

    expect(spoken).toContain("Two ways");
    expect(spoken).toContain("Use this one first");
    expect(spoken).toContain("the docs");
    expect(spoken).toContain("First item");
    expect(spoken).toContain("Ada, 4s");
    expect(spoken).toContain("Code block.");
    expect(spoken).not.toContain("**");
    expect(spoken).not.toContain("https://example.com");
    expect(spoken).not.toContain("const x = 1;");
    expect(spoken).not.toContain("|");
    expect(spoken).not.toMatch(/^#/m);
  });
});

describe("splitForSpeech", () => {
  it("keeps short text in one chunk", () => {
    expect(splitForSpeech("Hello there. How are you?")).toEqual(["Hello there. How are you?"]);
  });

  it("never returns a chunk longer than the limit", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence ${i + 1} has a few words in it.`).join(" ");
    const chunks = splitForSpeech(text, 120);
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(120);
    expect(chunks.join(" ")).toBe(text);
  });

  it("splits a single huge sentence at word boundaries", () => {
    const text = `${"word ".repeat(80).trim()}.`;
    const chunks = splitForSpeech(text, 60);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(60);
    expect(chunks.join(" ")).toBe(text);
  });

  it("returns nothing for whitespace", () => {
    expect(splitForSpeech("  \n\t ")).toEqual([]);
  });
});

describe("pickVoice", () => {
  const voices = [
    voice("Google UK English Male", "en-GB"),
    voice("Google UK English Female", "en-GB"),
    voice("Samantha", "en-US"),
    voice("Daniel", "en-US"),
    voice("Amelie", "fr-FR"),
  ];

  it("prefers a matching female name in the same language", () => {
    expect(pickVoice(voices, "girl", "en-US")?.name).toBe("Samantha");
    expect(pickVoice(voices, "boy", "en-US")?.name).toBe("Daniel");
  });

  it("falls back to the same language when no gendered name matches", () => {
    expect(pickVoice([voice("Voice 1", "en-US"), voice("Voix", "fr-FR")], "girl", "en-US")?.name).toBe(
      "Voice 1",
    );
  });

  it("uses different voices for girl and boy when names are neutral", () => {
    const neutral = [voice("Voice 1", "en-US"), voice("Voice 2", "en-US")];
    expect(pickVoice(neutral, "girl", "en-US")?.name).toBe("Voice 1");
    expect(pickVoice(neutral, "boy", "en-US")?.name).toBe("Voice 2");
  });

  it("returns null instead of speaking a different language", () => {
    expect(pickVoice([voice("Amelie", "fr-FR")], "girl", "en-US")).toBeNull();
  });

  it("prefers an on-device voice when scores tie", () => {
    const picked = pickVoice(
      [voice("Samantha", "en-US", false), voice("Karen", "en-US", true)],
      "girl",
      "en-US",
    );
    expect(picked?.name).toBe("Karen");
  });

  it("has a higher pitch for the girl profile", () => {
    expect(VOICE_PROFILES.girl.pitch).toBeGreaterThan(1);
    expect(VOICE_PROFILES.boy.pitch).toBeLessThan(1);
  });

  it("validates stored choices", () => {
    expect(isVoiceChoice("girl")).toBe(true);
    expect(isVoiceChoice("boy")).toBe(true);
    expect(isVoiceChoice("robot")).toBe(false);
  });
});
