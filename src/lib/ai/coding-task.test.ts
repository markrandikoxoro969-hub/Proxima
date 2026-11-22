// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { AiProviderError, type AiProvider, type AiRequest } from "./types";
import {
  formatCodingFile,
  formatCodingTree,
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
    { files: [{ path: "src" }, { path: "src/a.ts" }] },
    { files: Array.from({ length: 13 }, (_, index) => ({ path: `src/${index}.ts` })) },
  ])("rejects unsafe, duplicate, empty, or excessive file plans", (value) => {
    expect(() => parseCodingPlan(JSON.stringify(value))).toThrow(/file plan/i);
  });

  it("formats nested folders and root files as a readable tree", () => {
    expect(
      formatCodingTree([
        { path: "app/ui/index.js", purpose: "" },
        { path: "app/main.py", purpose: "" },
        { path: "README.md", purpose: "" },
      ]),
    ).toBe(
      "### Project structure (planned)\n\n```text\n├── app/\n│   ├── ui/\n│   │   └── index.js\n│   └── main.py\n└── README.md\n```\n\n",
    );
  });

  it("repairs an invalid file and retains substantial earlier file context", async () => {
    let calls = 0;
    const provider = textProvider((input) => {
      calls++;
      expect(input.message).toContain("LAST_EXPORT");
      const marker = input.system?.match(/Required final marker: (<<<PROXIMA_FILE_COMPLETE:[^>]+>>>)/)?.[1];
      if (calls === 1) return "```ts\nexport const x = 1;\n```";
      expect(input.message).toContain("Previous attempt (unverified;");
      return `\`\`\`ts\nexport const x = 1;\n\`\`\`\n${marker}`;
    });
    const repair = vi.fn();
    await expect(
      generateCodingFile(provider, request, {
        file: plan[1],
        files: plan,
        completedFiles: [plan[0].path],
        completedContent: "x".repeat(20_000) + "LAST_EXPORT",
        onRepair: repair,
      }),
    ).resolves.toBe("export const x = 1;");
    expect(repair).toHaveBeenCalledOnce();
  });

  it("plans without generating source code", async () => {
    const provider = textProvider(() => JSON.stringify({ files: plan }));

    await expect(planCodingTask(provider, request)).resolves.toEqual(plan);
  });

  it("retries an invalid plan once with a stricter JSON-format reminder", async () => {
    let calls = 0;
    let retrySystem = "";
    const provider = textProvider((input) => {
      calls += 1;
      if (calls === 1) return "Here is the project structure.";
      retrySystem = input.system ?? "";
      return JSON.stringify({ files: plan });
    });

    await expect(planCodingTask(provider, request)).resolves.toEqual(plan);
    expect(calls).toBe(2);
    expect(retrySystem).toContain("Format correction: return one complete, valid JSON object");
  });

  it("does not loop indefinitely if the corrected plan is still invalid", async () => {
    let calls = 0;
    const provider = textProvider(() => {
      calls += 1;
      return "Not a valid file plan.";
    });

    await expect(planCodingTask(provider, request)).rejects.toMatchObject({ code: "bad_response" });
    expect(calls).toBe(2);
  });

  it("keeps deadline interruptions retryable instead of reporting them as user cancellations", async () => {
    const controller = new AbortController();
    controller.abort(Object.assign(new Error("deadline"), { name: "TimeoutError" }));
    const provider = textProvider(() => JSON.stringify({ files: plan }));

    await expect(planCodingTask(provider, { ...request, signal: controller.signal })).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("streams a draft before the file completes and does not expose the marker", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onDraft = vi.fn();
    const provider: AiProvider = {
      id: "test",
      label: "test",
      async *stream(input) {
        yield { type: "text", text: "```ts\n" };
        yield { type: "text", text: "export const partial = 1;\n" };
        await gate;
        const marker = input.system?.match(/Required final marker: (<<<PROXIMA_FILE_COMPLETE:[^>]+>>>)/)?.[1];
        yield { type: "text", text: `export const done = true;\n\`\`\`\n${marker}` };
      },
    };
    const pending = generateCodingFile(provider, request, {
      file: plan[0],
      files: plan,
      completedFiles: [],
      completedContent: "",
      onDraft,
    });
    await vi.waitFor(() => expect(onDraft).toHaveBeenCalledWith("export const partial = 1;\n"));
    release();
    await expect(pending).resolves.toContain("export const done = true;");
    expect(JSON.stringify(onDraft.mock.calls)).not.toContain("PROXIMA_FILE_COMPLETE");
  });

  it("clears an unverified draft before attempting a format repair", async () => {
    let calls = 0;
    const onDraft = vi.fn();
    const provider = textProvider((input) => {
      calls++;
      const marker = input.system?.match(/Required final marker: (<<<PROXIMA_FILE_COMPLETE:[^>]+>>>)/)?.[1];
      return calls === 1 ? "```ts\nconst bad = 1;\n```" : `\`\`\`ts\nconst good = 1;\n\`\`\`\n${marker}`;
    });
    await generateCodingFile(provider, request, {
      file: plan[0],
      files: plan,
      completedFiles: [],
      completedContent: "",
      onDraft,
    });
    expect(onDraft.mock.calls.map(([text]) => text)).toEqual(["const bad = 1;", "", "const good = 1;"]);
  });

  it("times out a stalled provider even if it ignores cancellation", async () => {
    vi.useFakeTimers();
    try {
      const provider: AiProvider = {
        id: "test",
        label: "test",
        async *stream() {
          yield { type: "text", text: "```ts\npartial" };
          await new Promise(() => {});
        },
      };
      const pending = generateCodingFile(provider, request, {
        file: plan[0],
        files: plan,
        completedFiles: [],
        completedContent: "",
      });
      const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(90_001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a buffered continuation alive when the provider reports activity", async () => {
    vi.useFakeTimers();
    try {
      const provider: AiProvider = {
        id: "test",
        label: "test",
        async *stream(input) {
          yield { type: "text", text: "```ts\nexport const x = 1;\n" };
          for (let i = 0; i < 2; i++) {
            await new Promise((resolve) => setTimeout(resolve, 60_000));
            yield { type: "activity", text: "" };
          }
          const marker = input.system?.match(
            /Required final marker: (<<<PROXIMA_FILE_COMPLETE:[^>]+>>>)/,
          )?.[1];
          yield { type: "text", text: `\`\`\`\n${marker}` };
        },
      };
      const onActivity = vi.fn();
      const pending = generateCodingFile(provider, request, {
        file: plan[0],
        files: plan,
        completedFiles: [],
        completedContent: "",
        onActivity,
      });
      await vi.advanceTimersByTimeAsync(120_001);
      await expect(pending).resolves.toBe("export const x = 1;");
      expect(onActivity).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops a stalled file promptly on cancellation", async () => {
    const controller = new AbortController();
    const provider: AiProvider = {
      id: "test",
      label: "test",
      async *stream() {
        await new Promise(() => {});
      },
    };
    const pending = generateCodingFile(
      provider,
      { ...request, signal: controller.signal },
      { file: plan[0], files: plan, completedFiles: [], completedContent: "" },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
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

  it("accepts complete source without a Markdown fence when the completion marker is present", async () => {
    const provider = textProvider((input) => {
      const marker = input.system?.match(/Required final marker: (<<<PROXIMA_FILE_COMPLETE:[^>]+>>>)/)?.[1];
      return `export const subtract = (a: number, b: number) => a - b;\n${marker}`;
    });

    await expect(
      generateCodingFile(provider, request, {
        file: plan[0],
        files: plan,
        completedFiles: [],
        completedContent: "",
      }),
    ).resolves.toBe("export const subtract = (a: number, b: number) => a - b;");
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

  it("automatically repairs a missing completion marker without committing partial output", async () => {
    let calls = 0;
    const provider = textProvider((input) => {
      calls += 1;
      if (calls === 1) return "```ts\nexport const value = 1;\n```";
      expect(input.message).toContain("export const value = 1;");
      const marker = input.system?.match(/Required final marker: (<<<PROXIMA_FILE_COMPLETE:[^>]+>>>)/)?.[1];
      return `\`\`\`ts\nexport const value = 1;\n\`\`\`\n${marker}`;
    });
    const code = await generateCodingFile(provider, request, {
      file: plan[0],
      files: plan,
      completedFiles: [],
      completedContent: "",
    });
    expect(calls).toBe(2);
    expect(code).toBe("export const value = 1;");
  });

  it("preserves completed project files beyond the 12000-character history limit", async () => {
    const completedContent = "file-one: " + "x".repeat(20_000) + "\nfile-two: LAST_EXPORT";
    const provider = textProvider((input) => {
      expect(input.message).toContain("file-one:");
      expect(input.message).toContain("LAST_EXPORT");
      const marker = input.system?.match(/Required final marker: (<<<PROXIMA_FILE_COMPLETE:[^>]+>>>)/)?.[1];
      return `export const done = true;\n${marker}`;
    });
    await expect(
      generateCodingFile(provider, request, {
        file: plan[1],
        files: plan,
        completedFiles: [plan[0].path],
        completedContent,
      }),
    ).resolves.toBe("export const done = true;");
  });

  it("bounds large project context and explicitly marks omitted earlier content", async () => {
    const completedContent = "EARLY_SECRET_SECTION" + "x".repeat(400_000) + "LAST_EXPORT";
    const provider = textProvider((input) => {
      expect(input.message).toContain("Earlier project content omitted");
      expect(input.message).not.toContain("EARLY_SECRET_SECTION");
      expect(input.message).toContain("LAST_EXPORT");
      const marker = input.system?.match(/Required final marker: (<<<PROXIMA_FILE_COMPLETE:[^>]+>>>)/)?.[1];
      return `export const done = true;\n${marker}`;
    });
    await generateCodingFile(provider, request, {
      file: plan[1],
      files: plan,
      completedFiles: [plan[0].path],
      completedContent,
    });
  });

  it("does not attempt a repair after cancellation", async () => {
    const controller = new AbortController();
    let calls = 0;
    const provider = textProvider(() => {
      calls++;
      controller.abort();
      return "unfinished";
    });
    await expect(
      generateCodingFile(
        provider,
        { ...request, signal: controller.signal },
        { file: plan[0], files: plan, completedFiles: [], completedContent: "" },
      ),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(calls).toBe(1);
  });

  it("bounds repair attempts and never accepts an unfinished file", async () => {
    let calls = 0;
    const provider = textProvider(() => {
      calls++;
      return "```ts\nexport const incomplete = true;\n```";
    });
    await expect(
      generateCodingFile(provider, request, {
        file: plan[0],
        files: plan,
        completedFiles: [],
        completedContent: "",
      }),
    ).rejects.toMatchObject({ code: "bad_response" });
    expect(calls).toBe(3);
  });

  it("does not retry authentication or quota errors at the file-format layer", async () => {
    let calls = 0;
    const provider: AiProvider = {
      id: "test",
      label: "test",
      async *stream() {
        calls++;
        throw new AiProviderError("quota", "upstream", 429);
      },
    };
    await expect(
      generateCodingFile(provider, request, {
        file: plan[0],
        files: plan,
        completedFiles: [],
        completedContent: "",
      }),
    ).rejects.toMatchObject({ code: "upstream", status: 429 });
    expect(calls).toBe(1);
  });

  it("repairs malformed multi-block output rather than merging unrelated blocks into source", async () => {
    let calls = 0;
    const provider = textProvider((input) => {
      calls++;
      const marker = input.system?.match(/Required final marker: (<<<PROXIMA_FILE_COMPLETE:[^>]+>>>)/)?.[1];
      return calls === 1
        ? `\`\`\`ts\nfirst\n\`\`\`\n\`\`\`ts\nsecond\n\`\`\`\n${marker}`
        : `\`\`\`ts\nexport const valid = true;\n\`\`\`\n${marker}`;
    });
    await expect(
      generateCodingFile(provider, request, {
        file: plan[0],
        files: plan,
        completedFiles: [],
        completedContent: "",
      }),
    ).resolves.toBe("export const valid = true;");
    expect(calls).toBe(2);
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
