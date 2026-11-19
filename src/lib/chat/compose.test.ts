import { describe, expect, it } from "vitest";
import { composePrompt, DEFAULT_TITLE, languageFromFilename, makeTitle } from "./compose";

describe("composePrompt", () => {
  it("returns the message unchanged when there are no files", () => {
    expect(composePrompt("Hello")).toBe("Hello");
  });

  it("puts each file in a code block with the right language", () => {
    const out = composePrompt("Fix it", [{ name: "main.py", content: "print(1)" }]);
    expect(out).toBe("Fix it\n\n--- Attached file: main.py ---\n```python\nprint(1)\n```");
  });

  it("uses a longer fence so a file containing ``` can't break out", () => {
    const out = composePrompt("Read", [{ name: "README.md", content: "```js\nx\n```" }]);
    expect(out).toContain("````markdown\n```js\nx\n```\n````");
  });
});

describe("languageFromFilename", () => {
  it.each([
    ["app.tsx", "tsx"],
    ["SCRIPT.PY", "python"],
    ["Dockerfile", "dockerfile"],
    ["notes", "text"],
    ["weird.xyz", "text"],
  ])("%s → %s", (name, lang) => expect(languageFromFilename(name)).toBe(lang));
});

describe("makeTitle", () => {
  it("keeps short messages and shortens long ones to 25 characters + …", () => {
    expect(makeTitle("Hi there")).toBe("Hi there");
    expect(makeTitle("Explain Quantum Physics simply")).toBe("Explain Quantum Physics s…");
    expect(makeTitle("line one\n\nline   two")).toBe("line one line two");
    expect(makeTitle("   ")).toBe(DEFAULT_TITLE);
  });
});
