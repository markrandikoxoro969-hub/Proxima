import { describe, expect, it } from "vitest";
import { splitMarkdownBlocks, toBlocks } from "./markdown-blocks";

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
  it("keeps loose lists together so numbering continues", () => {
    expect(toBlocks("Steps:\n\n1. First\n\n2. Second\n\n   more about second\n\nDone")).toEqual([
      "Steps:",
      "1. First\n\n2. Second\n\n   more about second",
      "Done",
    ]);
  });
});
