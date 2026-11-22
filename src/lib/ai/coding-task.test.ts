// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AiProvider, AiRequest } from "./types";
import {
  formatCodingFile,
  generateCodingFile,
  isMultiFileCodingRequest,
  parseCodingPlan,
  planCodingTask,
  readCodingTaskProgress,
  type CodingFilePlan,
} from "./coding-task";

const request: AiRequest = {
  message: "Create a small TypeScript project with an API and tests.",
  sessionId: "session-1",
  signal: new AbortController().signal,
  mode: "coding",
  system: "Base system instructions.",
};

function textProvider(reply: (request: AiRequest) => string): AiProvider {
  return {
    id: "test",
    label: "test",
    async *stream(input) {
      yield { type: "text", text: reply(input) };
    },
  };
}

const plan: CodingFilePlan[] = [
  { path: "src/math.ts", purpose: "Implement the reusable arithmetic functions." },
  { path: "src/math.test.ts", purpose: "Test the arithmetic functions." },
];

describe("multi-file coding tasks", () => {
  it("detects explicit multi-file requests and project scaffolding, but not a one-file question", () => {
    expect(isMultiFileCodingRequest("Generate a 4-file React app, file by file.")).toBe(true);
    expect(isMultiFileCodingRequest("Build a small full-stack task application.")).toBe(true);
    expect(isMultiFileCodingRequest("Update src/a.ts and src/b.ts together.")).toBe(true);
    expect(isMultiFileCodingRequest("Write one function that sorts numbers.")).toBe(false);
  });

  it("accepts an ordered, safe file plan", () => {
    expect(
      parseCodingPlan(
        JSON.stringify({
          files: [{ path: "src/index.ts", purpose: "Entry point." }, { path: "package.json" }],
        }),
      ),
    ).toEqual([
      { path: "src/index.ts", purpose: "Entry point." },
      { path: "package.json", purpose: "Implement package.json." },
    ]);
  });

  it.each([
    { files: [] },
    { files: [{ path: "../secret.txt", purpose: "escape" }] },
    { files: [{ path: "src/a.ts" }, { path: "src/a.ts" }] },
    { files: Array.from({ length: 13 }, (_, index) => ({ path: `src/${index}.ts` })) },
  ])("rejects unsafe, duplicate, empty, or excessive file plans", (value) => {
    expect(() => parseCodingPlan(JSON.stringify(value))).toThrow(/file plan/i);
  });

  it("plans without generating source code", async () => {
    const provider = textProvider(() => JSON.stringify({ files: plan }));

    await expect(planCodingTask(provider, request)).resolves.toEqual(plan);
  });

  it("keeps deadline interruptions retryable instead of reporting them as user cancellations", async () => {
    const controller = new AbortController();
    controller.abort(Object.assign(new Error("deadline"), { name: "TimeoutError" }));
    const provider = textProvider(() => JSON.stringify({ files: plan }));

    await expect(planCodingTask(provider, { ...request, signal: controller.signal })).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("generates exactly one file, checks its completion marker, and returns source only", async () => {
    const provider = textProvider((input) => {
      const marker = input.system?.match(/Required final marker: (<<<PROXIMA_FILE_COMPLETE:[^>]+>>>)/)?.[1];
      return `\`\`\`typescript\nexport const add = (a: number, b: number) => a + b;\n\`\`\`\n${marker}`;
    });

    const code = await generateCodingFile(provider, request, {
      file: plan[0],
      files: plan,
      completedFiles: [],
      completedContent: "",
    });

    expect(code).toBe("export const add = (a: number, b: number) => a + b;");
  });

  it("rejects a file response without its completion marker", async () => {
    const provider = textProvider(() => "```ts\nexport const partial = true;\n```");

    await expect(
      generateCodingFile(provider, request, {
        file: plan[0],
        files: plan,
        completedFiles: [],
        completedContent: "",
      }),
    ).rejects.toMatchObject({ code: "bad_response" });
  });

  it("formats saved files as path-labeled blocks and nests source fences safely", () => {
    const source = "const example = `\n```\n`;";
    expect(formatCodingFile("src/example.ts", source)).toBe(
      "### `src/example.ts`\n\n````typescript\nconst example = `\n```\n`;\n````\n\n",
    );
  });

  it("validates persisted progress and drops unknown completed paths", () => {
    expect(
      readCodingTaskProgress({
        kind: "multi-file-coding",
        version: 1,
        state: "interrupted",
        files: plan,
        completedFiles: ["src/math.ts", "outside.ts"],
        currentFile: "src/math.test.ts",
      }),
    ).toEqual({
      kind: "multi-file-coding",
      version: 1,
      state: "interrupted",
      files: plan,
      completedFiles: ["src/math.ts"],
      currentFile: "src/math.test.ts",
    });
    expect(readCodingTaskProgress({ kind: "other", version: 1 })).toBeNull();
  });
});
