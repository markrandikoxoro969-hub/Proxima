import { describe, expect, it } from "vitest";
import { looksBinary, readAttachments } from "./files";

const file = (name: string, content: string | Uint8Array) => new File([content as BlobPart], name);

describe("readAttachments", () => {
  it("reads small text files", async () => {
    const { accepted, problems } = await readAttachments([file("app.py", "print('hi')")], 0);
    expect(problems).toEqual([]);
    expect(accepted[0]).toMatchObject({ name: "app.py", size: 11, content: "print('hi')" });
  });

  it("rejects files over 100 KB, empty files and binary files with clear reasons", async () => {
    const { accepted, problems } = await readAttachments(
      [
        file("big.txt", "a".repeat(100 * 1024 + 1)),
        file("empty.md", ""),
        file("photo.png", new Uint8Array([137, 80, 78, 71, 0, 0, 0, 13])),
      ],
      0,
    );
    expect(accepted).toEqual([]);
    expect(problems.map((p) => p.name)).toEqual(["big.txt", "empty.md", "photo.png"]);
    expect(problems[0].reason).toMatch(/max 100 KB/);
    expect(problems[2].reason).toMatch(/isn't a text file/);
  });

  it("allows at most 3 files in total", async () => {
    const { accepted, problems } = await readAttachments([file("a.txt", "a"), file("b.txt", "b")], 2);
    expect(accepted.map((f) => f.name)).toEqual(["a.txt"]);
    expect(problems[0]).toMatchObject({ name: "b.txt", reason: expect.stringMatching(/up to 3/) });
  });
});

describe("looksBinary", () => {
  it("spots NUL bytes and broken encodings but accepts normal text in any language", () => {
    expect(looksBinary("hello\u0000world")).toBe(true);
    expect(looksBinary("\uFFFD".repeat(50) + "abc")).toBe(true);
    expect(looksBinary("नमस्ते, Proxima! 👋\nconst x = 1;")).toBe(false);
  });
});
