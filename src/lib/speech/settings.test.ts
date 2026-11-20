import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDGE_VOICES,
  DEFAULT_OPENAI_VOICES,
  DEFAULT_POLLINATIONS_VOICES,
  edgeSpeechConfigured,
  pollinationsSpeechConfigured,
  resolveSpeechSettings,
  speechTimeoutMs,
  speechVoiceId,
} from "./settings";

describe("resolveSpeechSettings", () => {
  it("uses auto when nothing is set", () => {
    expect(resolveSpeechSettings({}).id).toBe("auto");
  });

  it("accepts every documented provider", () => {
    for (const id of ["auto", "openai", "pollinations", "edge", "off"]) {
      expect(resolveSpeechSettings({ SPEECH_PROVIDER: id }).id).toBe(id);
    }
  });

  it("falls back to auto for a web address or a typo", () => {
    const address = resolveSpeechSettings({ SPEECH_PROVIDER: "https://example.com/tts" });
    expect(address.id).toBe("auto");
    expect(address.warning).toMatch(/name like "edge"/);

    const typo = resolveSpeechSettings({ SPEECH_PROVIDER: "open-ai" });
    expect(typo.id).toBe("auto");
    expect(typo.warning).toMatch(/unknown/);
  });
});

describe("speechVoiceId", () => {
  it("maps girl and boy to natural voices on every engine", () => {
    expect(speechVoiceId("edge", "girl", {})).toBe(DEFAULT_EDGE_VOICES.girl);
    expect(speechVoiceId("edge", "boy", {})).toBe(DEFAULT_EDGE_VOICES.boy);
    expect(speechVoiceId("openai", "girl", {})).toBe(DEFAULT_OPENAI_VOICES.girl);
    expect(speechVoiceId("openai", "boy", {})).toBe(DEFAULT_OPENAI_VOICES.boy);
    expect(speechVoiceId("pollinations", "girl", {})).toBe(DEFAULT_POLLINATIONS_VOICES.girl);
    expect(speechVoiceId("pollinations", "boy", {})).toBe(DEFAULT_POLLINATIONS_VOICES.boy);
  });

  it("lets an environment variable replace a voice", () => {
    expect(speechVoiceId("edge", "girl", { SPEECH_EDGE_VOICE_GIRL: "en-US-EmmaMultilingualNeural" })).toBe(
      "en-US-EmmaMultilingualNeural",
    );
    expect(speechVoiceId("openai", "boy", { SPEECH_OPENAI_VOICE_BOY: "ash" })).toBe("ash");
    expect(speechVoiceId("pollinations", "girl", { SPEECH_POLLINATIONS_VOICE_GIRL: "" })).toBe(
      DEFAULT_POLLINATIONS_VOICES.girl,
    );
  });
});

describe("speech configuration", () => {
  it("needs a Pollinations key but not an Edge one", () => {
    expect(pollinationsSpeechConfigured({})).toBe(false);
    expect(pollinationsSpeechConfigured({ POLLINATIONS_API_KEY: "sk_test" })).toBe(true);
    expect(edgeSpeechConfigured({})).toBe(true);
    expect(edgeSpeechConfigured({ SPEECH_EDGE: "off" })).toBe(false);
  });

  it("keeps the timeout inside the 30-second route budget", () => {
    expect(speechTimeoutMs({})).toBe(25_000);
    expect(speechTimeoutMs({ SPEECH_TIMEOUT_MS: "9000" })).toBe(9_000);
    expect(speechTimeoutMs({ SPEECH_TIMEOUT_MS: "999999" })).toBe(25_000);
    expect(speechTimeoutMs({ SPEECH_TIMEOUT_MS: "not a number" })).toBe(25_000);
  });
});
