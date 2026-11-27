import { describe, expect, it } from "vitest";
import { openRouterFirstTokenTimeoutMs } from "@/lib/ai";
import { createDefaultToolRegistry } from "@/lib/ai/agent/tools";
import { buildSandboxDocument } from "@/lib/chat/client/code-bundle";
import { identitySystemSection } from "@/lib/identity";
import {
  createCommandTagStreamFilter,
  executeChatCommands,
  extractProximaCommands,
  extractWorkspaceFilesFromHistory,
  formatTerminalToolBlock,
  formatTerminalTranscript,
  hasCommandPromptIntent,
  parseSlashCommand,
} from "./chat-command-bridge";
import { extractGeneratedFiles } from "@/lib/chat/client/code-bundle";
import { createCommandPromptState, executeCommandLine } from "./command-prompt";
import { runProximaCommand } from "./server-command";
import { assertSafePublicUrl, extractTextFromHtml, formatScrapedPage } from "./web-scrape";

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

  it("wires Proxima self-awareness and natural chat command-prompt bridge cleanly", async () => {
    const sys = identitySystemSection();
    expect(sys).toContain("Command Prompt");
    expect(sys).toContain("proxima-sh");
    expect(sys).toContain("<proxima_cmd>");

    expect(parseSlashCommand("/cmd ls -la")).toBe("ls -la");
    expect(parseSlashCommand("/sh node -e 'console.log(1)'")).toBe("node -e 'console.log(1)'");
    expect(parseSlashCommand("hello world")).toBeNull();

    expect(hasCommandPromptIntent("run uname -a in your command prompt")).toBe(true);
    expect(hasCommandPromptIntent("execute `node -e 'console.log(2+2)'`")).toBe(true);
    expect(hasCommandPromptIntent("tell me a bedtime story")).toBe(false);

    const extracted = extractProximaCommands(
      'Sure! <proxima_cmd>uname && node -e "console.log(99 + 1)"</proxima_cmd>',
    );
    expect(extracted).toEqual(['uname && node -e "console.log(99 + 1)"']);

    const historyFiles = extractWorkspaceFilesFromHistory([
      { content: "### `src/hi.js`\n```js\nconsole.log('from-history');\n```" },
    ]);
    expect(historyFiles.map((f) => f.path)).toEqual(["src/hi.js"]);

    const { runs } = await executeChatCommands(["node src/hi.js"], historyFiles);
    expect(runs[0]!.exitCode).toBe(0);
    expect(runs[0]!.stdout).toBe("from-history");
    expect(formatTerminalTranscript(runs)).toContain("proxima@sandbox:/workspace$ node src/hi.js");
  });

  it("supports pip install bs4, live HTML text scraping, SSRF blocking, and fast OpenRouter failover", async () => {
    // Free-will scraping intent detection
    expect(
      hasCommandPromptIntent(
        "i want to scrap https://example.com only its texts so i can know the key points",
      ),
    ).toBe(true);

    // SSRF guard blocks local, metadata, private IPs, and non-http protocols
    await expect(assertSafePublicUrl("http://127.0.0.1:3000/secret")).rejects.toThrow(/Blocked/i);
    await expect(assertSafePublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/Blocked/i);
    await expect(assertSafePublicUrl("http://localhost/admin")).rejects.toThrow(/Blocked/i);
    await expect(assertSafePublicUrl("file:///etc/passwd")).rejects.toThrow(/Only http/i);

    // HTML extraction strips scripts/styles and extracts title, headings, and readable text
    const html = `<!doctype html><html><head><title>Proxima Docs</title><meta name="description" content="Fast AI workspace"><style>body{color:red}</style></head><body><script>alert(1)</script><h1>Welcome to Proxima</h1><p>Build &amp; run code safely.</p><h2>Key Features</h2><p>Sandbox + Command Prompt.</p></body></html>`;
    const scraped = extractTextFromHtml(html, "https://docs.proxima.ai", 200);
    expect(scraped.title).toBe("Proxima Docs");
    expect(scraped.description).toBe("Fast AI workspace");
    expect(scraped.headings).toEqual(["Welcome to Proxima", "Key Features"]);
    expect(scraped.text).toContain("Build & run code safely.");
    expect(scraped.text).not.toContain("alert(1)");
    expect(scraped.text).not.toContain("color:red");

    // pip install bs4 + python3 scraper workflow inside proxima-sh
    const state = createCommandPromptState([]);
    const res = await executeCommandLine(
      'pip install beautifulsoup4 requests && python3 -c "import requests; from bs4 import BeautifulSoup; r = requests.get(\'https://docs.proxima.ai\'); print(BeautifulSoup(r.text, \'html.parser\').get_text())"',
      state,
      {
        fetchUrl: async (url) => ({ ok: true, text: formatScrapedPage(extractTextFromHtml(html, url, 200)) }),
      },
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("Successfully installed beautifulsoup4-4.12.3 requests-2.32.3");
    expect(res.stdout).toContain("Title: Proxima Docs");
    expect(res.stdout).toContain("Build & run code safely.");

    // Coding failover timeout is fast (20s default instead of 2.5 minutes)
    expect(openRouterFirstTokenTimeoutMs({})).toBe(20_000);
  });

  it("intercepts chunked <proxima_cmd> tags without leaking, supports ||/2>&1/curl -o, and renders reload-safe terminal cards", async () => {
    const filter = createCommandTagStreamFilter();
    const chunks = [
      "Let me check ",
      "that for you. <pro",
      "xima_cmd>echo hi && ",
      "ls -la</proxima_",
      "cmd> Almost done!",
    ];
    let visible = "";
    for (const c of chunks) visible += filter.push(c);
    const flushed = filter.flush();
    visible += flushed.text;

    expect(visible).toBe("Let me check that for you.  Almost done!");
    expect(visible).not.toContain("proxima_cmd");
    expect(flushed.commands).toEqual(["echo hi && ls -la"]);

    // Supports || fallback chaining, 2>&1 stderr merge, and /dev/null sink
    const state = createCommandPromptState([]);
    const fallback = await executeCommandLine("cat missing.txt 2>/dev/null || echo recovered", state);
    expect(fallback.exitCode).toBe(0);
    expect(fallback.stdout).toBe("recovered");
    expect(fallback.stderr).toBe("");

    // Supports curl -sL -o <file>
    const curlSave = await executeCommandLine("curl -sL https://example.com -o page.txt && cat page.txt", state, {
      fetchUrl: async () => ({ ok: true, text: "Hello from live site" }),
    });
    expect(curlSave.exitCode).toBe(0);
    expect(curlSave.stdout).toContain("Hello from live site");

    // Arena-style terminal card block is never misclassified as a generated code file for Sandbox/ZIP
    const card = formatTerminalToolBlock({
      command: "ls -la",
      cwd: "/workspace",
      stdout: "index.html",
      stderr: "",
      exitCode: 0,
      durationMs: 12,
    });
    expect(card).toContain("```proxima-terminal");
    expect(extractGeneratedFiles(card)).toEqual([]);
  });
});
