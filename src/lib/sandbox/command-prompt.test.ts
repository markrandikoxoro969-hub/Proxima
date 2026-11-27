import { describe, expect, it } from "vitest";
import { createDefaultToolRegistry } from "@/lib/ai/agent/tools";
import { buildSandboxDocument } from "@/lib/chat/client/code-bundle";
import { createCommandPromptState, executeCommandLine } from "./command-prompt";
import { runProximaCommand } from "./server-command";

describe("Proxima Command Prompt engine", () => {
  it("supports directory navigation, file CRUD, redirects, pipes, and chaining", async () => {
    let state = createCommandPromptState([
      { path: "index.html", language: "html", content: "<h1>Hello Proxima</h1>" },
    ]);

    let res = await executeCommandLine(
      'mkdir src && cd src && echo "export const v = 1;" > app.js && echo "export const w = 2;" >> app.js && pwd',
      state,
    );
    expect(res.exitCode).toBe(0);
    expect(res.filesChanged).toBe(true);
    expect(res.stdout).toBe("/workspace/src");
    state = res.state;

    // Pipe cat into grep
    res = await executeCommandLine("cat app.js | grep w", state);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe("export const w = 2;");

    // Tree from root
    res = await executeCommandLine("cd / && tree", state);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("index.html");
    expect(res.stdout).toContain("app.js");

    // Blocks escaping workspace root
    res = await executeCommandLine("cd ../../../etc", res.state);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("outside workspace");
  });

  it("executes JavaScript safely via node -e and node <file> in server VM with zero host access", async () => {
    const res = await runProximaCommand({
      command: 'node -e "console.log(6 * 7)" && node calc.js',
      files: [{ path: "calc.js", language: "js", content: "console.log('sum=' + [1,2,3].reduce((a,b)=>a+b,0));" }],
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe("42\nsum=6");

    // Host process / require are NOT exposed inside the isolated sandbox VM
    const isolated = await runProximaCommand({
      command: 'node -e "console.log(typeof process, typeof require)"',
    });
    expect(isolated.exitCode).toBe(0);
    expect(isolated.stdout).toBe("undefined undefined");
  });

  it("exposes run_command directly to Proxima's Agent Tool Registry", async () => {
    const registry = createDefaultToolRegistry();
    expect(registry.get("run_command")).toBeDefined();

    const invocation = await registry.invoke({
      callId: "cmd-1",
      toolName: "run_command",
      args: {
        command: 'echo "hello world" > note.txt && wc note.txt && node -e "console.log(2 ** 10)"',
      },
      ctx: { userId: "u1" },
    });

    expect(invocation.ok).toBe(true);
    const parsed = JSON.parse(invocation.output) as {
      exitCode: number;
      stdout: string;
      fileCount: number;
    };
    expect(parsed.exitCode).toBe(0);
    expect(parsed.stdout).toContain("note.txt");
    expect(parsed.stdout).toContain("1024");
    expect(parsed.fileCount).toBe(1);
  });

  it("auto-injects mobile viewport meta into sandbox HTML fragments so previews scale crisply", () => {
    const doc = buildSandboxDocument(
      [{ path: "index.html", language: "html", content: "<main><h1>Responsive!</h1></main>" }],
      "r1",
    );
    expect(doc).toContain('name="viewport"');
    expect(doc).toContain("width=device-width, initial-scale=1.0");
    expect(doc).toContain("<!DOCTYPE html>");
  });
});
