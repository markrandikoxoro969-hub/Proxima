import { describe, expect, it } from "vitest";
import {
  DEFAULT_NVIDIA_MAX_TOKENS,
  DEFAULT_NVIDIA_MODEL,
  DEFAULT_NVIDIA_VISION_MODEL,
  DEFAULT_RENDER_URL,
  resolveAiSettings,
  resolveNvidiaSettings,
} from "./settings";

describe("resolveAiSettings", () => {
  it("defaults to NVIDIA", () => {
    expect(resolveAiSettings({})).toEqual({ id: "nvidia", url: DEFAULT_RENDER_URL });
    expect(resolveAiSettings({ AI_PROVIDER: " NVIDIA " }).id).toBe("nvidia");
  });

  it("understands render and its old name sujan-core", () => {
    expect(resolveAiSettings({ AI_PROVIDER: "render" })).toEqual({
      id: "render",
      url: DEFAULT_RENDER_URL,
    });
    expect(resolveAiSettings({ AI_PROVIDER: "Sujan-Core" }).id).toBe("render");
    expect(resolveAiSettings({ AI_PROVIDER: "mock" }).id).toBe("mock");
  });

  it("uses a web address put in AI_PROVIDER as the Render address (with a tip)", () => {
    const result = resolveAiSettings({ AI_PROVIDER: "https://my-ai.example.com/chat" });
    expect(result.id).toBe("render");
    expect(result.url).toBe("https://my-ai.example.com/chat");
    expect(result.warning).toContain("web address");
  });

  it("prefers AI_API_URL and never breaks on an unknown name", () => {
    expect(resolveAiSettings({ AI_API_URL: "https://x.dev/chat" }).url).toBe("https://x.dev/chat");
    const unknown = resolveAiSettings({ AI_PROVIDER: "gpt" });
    expect(unknown).toMatchObject({ id: "nvidia", url: DEFAULT_RENDER_URL });
    expect(unknown.warning).toContain('"gpt" is unknown');
  });
});

describe("resolveNvidiaSettings", () => {
  it("uses the documented defaults", () => {
    const settings = resolveNvidiaSettings({ NVIDIA_API_KEY: "nvapi-abc" });
    expect(settings.model).toBe(DEFAULT_NVIDIA_MODEL);
    expect(settings.maxTokens).toBe(DEFAULT_NVIDIA_MAX_TOKENS);
    expect(settings.enableThinking).toBe(true);
    expect(settings.baseURL).toBe("https://integrate.api.nvidia.com/v1");
    expect(settings.firstTokenTimeoutMs).toBe(45_000);
    expect(settings.visionModel).toBe(DEFAULT_NVIDIA_VISION_MODEL);
  });

  it("can read pictures with a different vision model, or turn the reader off", () => {
    expect(resolveNvidiaSettings({ NVIDIA_VISION_MODEL: "meta/custom-vl" }).visionModel).toBe(
      "meta/custom-vl",
    );
    for (const off of ["off", "none", "false", "0", " OFF "]) {
      expect(resolveNvidiaSettings({ NVIDIA_VISION_MODEL: off }).visionModel).toBe("");
    }
  });

  it("reads every value from the environment", () => {
    const settings = resolveNvidiaSettings({
      NVIDIA_API_KEY: "nvapi-abc",
      NVIDIA_MODEL: "nvidia/custom",
      NVIDIA_MAX_TOKENS: "1024",
      NVIDIA_ENABLE_THINKING: "false",
      NVIDIA_TIMEOUT_MS: "12000",
      NVIDIA_BASE_URL: "https://example.test/v1",
    });
    expect(settings).toMatchObject({
      model: "nvidia/custom",
      maxTokens: 1024,
      enableThinking: false,
      firstTokenTimeoutMs: 12_000,
      baseURL: "https://example.test/v1",
    });
  });
});
