import { describe, expect, it } from "vitest";
import { hasUnclosedCodeFence, splitMarkdownBlocks, toBlocks } from "./markdown-blocks";

describe("splitMarkdownBlocks", () => {
  it("splits paragraphs at blank lines", () => {
    expect(splitMarkdownBlocks("One\nstill one\n\nTwo\n\n\nThree")).toEqual([
      "One\nstill one",
      "Two",
      "Three",
    ]);
  });

  it("never splits inside a code fence, even with blank lines", () => {
    const md = "Intro\n\n```python\ndef a():\n\n    return 1\n```\n\nAfter";
    expect(splitMarkdownBlocks(md)).toEqual(["Intro", "```python\ndef a():\n\n    return 1\n```", "After"]);
  });

  it("keeps an unfinished (still streaming) fence as one block", () => {
    expect(splitMarkdownBlocks("Text\n\n```js\nconst a = 1;\n\nconst b")).toEqual([
      "Text",
      "```js\nconst a = 1;\n\nconst b",
    ]);
  });

  it("only closes a fence with the same marker", () => {
    const md = "````md\n```js\nx\n```\n\nstill inside\n````";
    expect(splitMarkdownBlocks(md)).toEqual([md]);
  });
});

describe("toBlocks", () => {
  it("keeps a lettered list together across a blank line", () => {
    expect(toBlocks("Points:\n\nA. First point\n\nB. Second point")).toEqual([
      "Points:",
      "A. First point\n\nB. Second point",
    ]);
  });

  it("keeps a table together even if a blank line slips in", () => {
    expect(toBlocks("| Option | Cost |\n| --- | --- |\n\n| A | 1 |\n| B | 2 |")).toEqual([
      "| Option | Cost |\n| --- | --- |\n\n| A | 1 |\n| B | 2 |",
    ]);
  });

  it("keeps loose lists together so numbering continues", () => {
    expect(toBlocks("Steps:\n\n1. First\n\n2. Second\n\n   more about second\n\nDone")).toEqual([
      "Steps:",
      "1. First\n\n2. Second\n\n   more about second",
      "Done",
    ]);
  });
});

describe("hasUnclosedCodeFence", () => {
  it("is false for a complete block and true for a cut-off one", () => {
    expect(hasUnclosedCodeFence("```js\nconst a = 1;\n```")).toBe(false);
    expect(hasUnclosedCodeFence("Here is the fix:\n\n```js\nconst a = 1;")).toBe(true);
  });

  it("understands longer fences and tildes", () => {
    expect(hasUnclosedCodeFence("````md\n```js\nx\n```\n````")).toBe(false);
    expect(hasUnclosedCodeFence("~~~python\nprint(1)\n~~~")).toBe(false);
  });

  it("ignores fences inside inline text", () => {
    expect(hasUnclosedCodeFence("Use `npm test` before shipping.")).toBe(false);
  });
});
