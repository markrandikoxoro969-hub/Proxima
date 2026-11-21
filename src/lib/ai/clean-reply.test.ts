import { describe, expect, it } from "vitest";
import { LeadingCleanGate, stripFiller } from "./clean-reply";

describe("stripFiller", () => {
  it("removes common preambles", () => {
    expect(stripFiller("Great question! Here's a quick breakdown: use a Map.")).toBe(
      "use a Map.",
    );
    expect(stripFiller("Sure, I'd be happy to help with that. Run `npm install`.")).toBe(
      "Run `npm install`.",
    );
    expect(stripFiller("As an AI language model, I cannot browse. But I can explain.")).toBe(
      "But I can explain.",
    );
  });

  it("removes sign-offs", () => {
    expect(stripFiller("Use a Set for O(1) lookups. I hope this helps!")).toBe(
      "Use a Set for O(1) lookups.",
    );
    expect(stripFiller("That is the whole idea. Let me know if you have any questions.")).toBe(
      "That is the whole idea.",
    );
  });

  it("never deletes the entire answer", () => {
    expect(stripFiller("Sure.")).toBe("Sure.");
    expect(stripFiller("Certainly!")).toBe("Certainly!");
  });

  it("leaves real content and code alone", () => {
    const code = "```python\nprint('hi')\n```";
    expect(stripFiller(code)).toBe(code);
    expect(stripFiller("No, the answer is 42.")).toBe("No, the answer is 42.");
  });

  it("never rewrites blank lines inside a code block", () => {
    // A string literal can contain three or more newlines; collapsing them
    // would silently change what the generated program prints.
    const code = "```javascript\nconst message = `a\n\n\n\nb`;\nconsole.log(message);\n```";
    expect(stripFiller(code)).toBe(code);
  });

  it("still tidies extra blank lines in the prose around code", () => {
    expect(stripFiller("Great question!\n\n\n\nRun this:\n\n```js\nconst a = 1;\n```")).toBe(
      "Run this:\n\n```js\nconst a = 1;\n```",
    );
  });
});

describe("LeadingCleanGate", () => {
  const run = (chunks: string[]) => {
    const gate = new LeadingCleanGate();
    const out = chunks.map((c) => gate.push(c)).join("");
    return out + gate.flush();
  };

  it("holds the first sentence, cleans it, then passes text straight through", () => {
    expect(run(["Great question! ", "Use a ", "Map."])).toBe("Use a Map.");
    expect(run(["Sure! ", "Run the tests.", " Then ship."])).toBe("Run the tests. Then ship.");
  });

  it("never emits a partial first sentence before deciding", () => {
    const gate = new LeadingCleanGate();
    expect(gate.push("Here's a quick summary")).toBe("");
    expect(gate.push(": the answer is 7.")).toBe("the answer is 7.");
  });

  it("releases early on a newline (code, headings, lists)", () => {
    const gate = new LeadingCleanGate();
    expect(gate.push("```js\nconst a = 1;")).toBe("```js\nconst a = 1;");
  });

  it("gives up holding after the safety limit", () => {
    const gate = new LeadingCleanGate(10);
    expect(gate.push("x".repeat(12))).toBe("x".repeat(12));
  });
});
