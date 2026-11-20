import { describe, expect, it } from "vitest";
import { DEFAULT_SUJAN_CORE_URL, resolveAiSettings } from "./settings";

describe("resolveAiSettings", () => {
  it("defaults to the real PROXIMA Core API", () => {
    expect(resolveAiSettings({})).toEqual({ id: "sujan-core", url: DEFAULT_SUJAN_CORE_URL });
    expect(resolveAiSettings({ AI_PROVIDER: " Sujan-Core " })).toEqual({
      id: "sujan-core",
      url: DEFAULT_SUJAN_CORE_URL,
    });
    expect(resolveAiSettings({ AI_PROVIDER: "mock" }).id).toBe("mock");
  });

  it("uses a web address put in AI_PROVIDER as the AI address (with a tip)", () => {
    const result = resolveAiSettings({ AI_PROVIDER: "https://my-ai.example.com/chat" });
    expect(result.id).toBe("sujan-core");
    expect(result.url).toBe("https://my-ai.example.com/chat");
    expect(result.warning).toContain("web address");
  });

  it("prefers AI_API_URL and never breaks on an unknown name", () => {
    expect(resolveAiSettings({ AI_API_URL: "https://x.dev/chat" }).url).toBe("https://x.dev/chat");
    const unknown = resolveAiSettings({ AI_PROVIDER: "gpt" });
    expect(unknown).toMatchObject({ id: "sujan-core", url: DEFAULT_SUJAN_CORE_URL });
    expect(unknown.warning).toContain('"gpt" is unknown');
  });
});
