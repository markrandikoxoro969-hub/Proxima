import { describe, expect, it } from "vitest";
import {
  buildSandboxDocument,
  extractGeneratedFiles,
  mergeGeneratedFilesFromHistory,
  sanitizeFilePath,
} from "./code-bundle";
import { buildZipArchive, crc32 } from "./zip";

describe("sanitizeFilePath", () => {
  it("normalizes slashes and rejects traversal paths", () => {
    expect(sanitizeFilePath("src/app.ts")).toBe("src/app.ts");
    expect(sanitizeFilePath("/public\\index.html")).toBe("public/index.html");
    expect(sanitizeFilePath("../etc/passwd")).toBeNull();
    expect(sanitizeFilePath("src/../secret.env")).toBeNull();
    expect(sanitizeFilePath("")).toBeNull();
  });
});

describe("extractGeneratedFiles", () => {
  it("extracts Proxima multi-file coding replies and skips directory tree blocks", () => {
    const markdown = [
      "```text",
      "├── public/",
      "│   └── index.html",
      "└── src/",
      "    ├── styles.css",
      "    └── app.js",
      "```",
      "",
      "### `public/index.html`",
      "```html",
      '<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body><h1>Hi</h1><script src="app.js"></script></body></html>',
      "```",
      "",
      "### `src/styles.css`",
      "```css",
      "body { color: white; }",
      "```",
      "",
      "### `src/app.js`",
      "```js",
      'console.log("hello sandbox");',
      "```",
    ].join("\n");

    const files = extractGeneratedFiles(markdown);
    expect(files.map((f) => f.path)).toEqual(["public/index.html", "src/styles.css", "src/app.js"]);
    expect(files[0]!.language).toBe("html");
    expect(files[2]!.content).toContain("hello sandbox");
  });

  it("names standalone code blocks cleanly", () => {
    const markdown = "Here is a snippet:\n```js\nconsole.log(42);\n```";
    const files = extractGeneratedFiles(markdown);
    expect(files).toEqual([{ path: "script.js", language: "js", content: "console.log(42);" }]);
  });
});

describe("buildSandboxDocument", () => {
  it("inlines linked virtual CSS and JS files into the HTML document with console bridge", () => {
    const doc = buildSandboxDocument(
      [
        {
          path: "index.html",
          language: "html",
          content:
            '<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body><script src="app.js"></script></body></html>',
        },
        { path: "styles.css", language: "css", content: "body{background:#000}" },
        { path: "app.js", language: "js", content: 'console.log("ok")' },
      ],
      "run-1",
    );

    expect(doc).toContain("__proximaSandbox");
    expect(doc).toContain('data-file="styles.css"');
    expect(doc).toContain("body{background:#000}");
    expect(doc).toContain('data-file="app.js"');
    expect(doc).toContain('console.log("ok")');
  });
});

describe("buildZipArchive", () => {
  it("computes standard IEEE CRC-32 and writes valid PKZIP local, central, and EOCD headers", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);

    const bytes = buildZipArchive([
      { path: "src/index.ts", content: "export const ok = true;\n" },
      { path: "public/index.html", content: "<h1>Proxima</h1>" },
      { path: "../blocked.txt", content: "nope" },
    ]);

    const view = new DataView(bytes.buffer);
    // Starts with Local File Header signature PK\x03\x04
    expect(view.getUint32(0, true)).toBe(0x04034b50);

    // Ends with End of Central Directory signature PK\x05\x06 and exactly 2 valid entries
    const eocdOffset = bytes.length - 22;
    expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(eocdOffset + 8, true)).toBe(2);
    expect(view.getUint16(eocdOffset + 10, true)).toBe(2);

    // Central directory starts at the declared offset with signature PK\x01\x02
    const centralOffset = view.getUint32(eocdOffset + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);

    // Contains both safe file paths and excludes traversal path
    const ascii = new TextDecoder().decode(bytes);
    expect(ascii).toContain("src/index.ts");
    expect(ascii).toContain("public/index.html");
    expect(ascii).not.toContain("blocked.txt");
  });
});

describe("mergeGeneratedFilesFromHistory", () => {
  it("merges an edited JS file back into the earlier multi-file website so Sandbox runs the complete site", () => {
    const messages = [
      { role: "user", content: "make a website" },
      {
        role: "assistant",
        content: [
          "### `index.html`",
          "```html",
          '<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body><button id="btn">Click</button><script src="app.js"></script></body></html>',
          "```",
          "### `styles.css`",
          "```css",
          "body { background: black; }",
          "```",
          "### `app.js`",
          "```js",
          'console.log("v1");',
          "```",
        ].join("\n"),
      },
      { role: "user", content: "edit js file to log v2" },
      {
        role: "assistant",
        content: "Updated the JS:\n```js\nconsole.log('v2');\n```",
      },
      { role: "assistant", content: "Sure, let me know if you need more tweaks!" },
    ];

    const merged = mergeGeneratedFilesFromHistory(messages, 3);
    expect(merged.map((f) => f.path)).toEqual(["index.html", "styles.css", "app.js"]);
    expect(merged.find((f) => f.path === "app.js")?.content).toContain("v2");
    expect(buildSandboxDocument(merged, "index.html")).toContain("console.log('v2')");

    // Non-code replies still do not trigger Sandbox
    expect(mergeGeneratedFilesFromHistory(messages, 4)).toEqual([]);
  });
});
