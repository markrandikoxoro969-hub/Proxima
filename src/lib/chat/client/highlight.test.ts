import { describe, expect, it } from "vitest";
import { languageLabel, normalizeLanguage } from "./code-languages";
import { highlight } from "./highlight";

describe("code languages", () => {
  it("understands common aliases and falls back to plain text (not JavaScript)", () => {
    expect(normalizeLanguage("py")).toBe("python");
    expect(normalizeLanguage("C#")).toBe("csharp");
    expect(normalizeLanguage("sh")).toBe("bash");
    expect(normalizeLanguage("brainfudge")).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
    expect(languageLabel(null)).toBe("text");
    expect(languageLabel("cpp")).toBe("C++");
  });
});

describe("highlight", () => {
  it("colours code with <span class> tokens only", () => {
    const html = highlight('def greet(name):\n    return f"Hi {name}"', "python")!;
    expect(html).toContain('<span class="token keyword">def</span>');
    expect(html).not.toMatch(/<(?!\/?span)/); // nothing but spans
  });

  it("escapes HTML inside code instead of running it", () => {
    const html = highlight('const x = "<img src=x onerror=alert(1)>";', "javascript")!;
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("supports every language in our list", () => {
    for (const lang of ["tsx", "php", "cpp", "rust", "go", "yaml", "docker", "sql", "kotlin", "markup"]) {
      expect(highlight("x", lang), lang).not.toBeNull();
    }
  });

  it("returns null for unknown languages", () => {
    expect(highlight("x", "nope")).toBeNull();
  });
});
