import "server-only";
import { extractGeneratedFiles, type GeneratedFile } from "@/lib/chat/client/code-bundle";
import {
  createCommandPromptState,
  executeCommandLine,
  formatPromptCwd,
  type CommandPromptState,
} from "./command-prompt";
import { serverCommandRuntime } from "./server-command";

export type ExecutedCommandRun = {
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

export type TerminalCardPayload = {
  command: string;
  cwd: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  expanded?: boolean;
};

const SLASH_CMD_RE = /^\/(?:cmd|sh|terminal|shell|exec)\s+([\s\S]+)$/i;
const MAX_COMMANDS_PER_ROUND = 4;
const MAX_COMMAND_CHARS = 1_500;
const MAX_CARD_OUTPUT_CHARS = 6_000;
const MAX_MODEL_OUTPUT_CHARS = 8_000;

/** Extracts a direct `/cmd <command>` (or `/sh`, `/terminal`, `/shell`, `/exec`) invocation. */
export function parseSlashCommand(message: string): string | null {
  const match = message.trim().match(SLASH_CMD_RE);
  return match?.[1]?.trim() || null;
}

/**
 * Legacy helper kept for compatibility & tests — detects explicit shell/scraping intent.
 * Note: Proxima's Arena-style streaming tool loop now works on EVERY chat message so
 * Proxima has true autonomous free will to run commands whenever helpful.
 */
export function hasCommandPromptIntent(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 2000) return false;
  if (parseSlashCommand(text)) return true;

  const hasUrl = /https?:\/\/[^\s]+|\bwww\.[a-z0-9-]+(?:\.[a-z]{2,})+/i.test(text);
  const wantsWebScrape =
    /\b(?:scrap(?:e|ing|ped)?|crawl(?:ing)?|bs4|beautifulsoup|extract\s+(?:only\s+)?(?:the\s+)?text|fetch\s+(?:the\s+)?(?:site|website|page|url)|read\s+(?:this\s+)?(?:site|website|page|link|url)|key\s*points?\s+(?:of|from)\s+(?:this\s+)?(?:site|website|page|link|url))\b/i.test(
      text,
    );
  if (wantsWebScrape || hasUrl) return true;

  const mentionsShell =
    /\b(?:command\s*prompt|terminal|shell|proxima-sh|cmd(?:\.exe)?|pip3?|curl|python3?)\b/i.test(text);
  const asksToRun =
    /\b(?:run|execute|exec|install|test|check|list|try|prove|show|open|use|eval|evaluate|scrape|scrap|fetch)\b/i.test(
      text,
    );
  if (mentionsShell && asksToRun) return true;

  if (
    /\b(?:run|execute|exec|install)\s+[`"']?(?:ls|tree|pwd|cat|echo|node|npm|pip3?|python3?|scrape|curl|grep|find|wc|uname|date|whoami|mkdir|touch|env|json)\b/i.test(
      text,
    )
  ) {
    return true;
  }

  return false;
}

/** Parses `<proxima_cmd>...</proxima_cmd>` tags AND fenced ```proxima_cmd blocks (up to 4). */
export function extractProximaCommands(text: string): string[] {
  const commands: string[] = [];
  const re =
    /<proxima_cmd\b[^>]*>([\s\S]*?)<\/proxima_cmd>|```proxima_cmd[ \t]*\r?\n([\s\S]*?)\r?\n?```/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = (match[1] ?? match[2] ?? "").trim();
    if (!raw) continue;
    commands.push(raw.slice(0, MAX_COMMAND_CHARS));
    if (commands.length >= MAX_COMMANDS_PER_ROUND) break;
  }
  return commands;
}

/** Strips `<proxima_cmd>...</proxima_cmd>` tags and ```proxima_cmd blocks from visible prose. */
export function stripProximaCommandTags(text: string): string {
  return text
    .replace(/<proxima_cmd\b[^>]*>[\s\S]*?<\/proxima_cmd>/gi, "")
    .replace(/```proxima_cmd[ \t]*\r?\n[\s\S]*?\r?\n?```/gi, "")
    .replace(/<proxima_cmd\b[^>]*>[\s\S]*$/gi, "")
    .trim();
}

/**
 * Streaming filter that lets regular prose flow to the browser immediately while
 * silently intercepting `<proxima_cmd>...</proxima_cmd>` tags (and ```proxima_cmd
 * fences), even when a tag is split across arbitrary SSE token boundaries.
 * Zero raw command tags ever flash on the user's screen.
 */
export function createCommandTagStreamFilter() {
  const OPEN_TAG = "<proxima_cmd";
  const CLOSE_TAG = "</proxima_cmd>";
  const OPEN_FENCE = "```proxima_cmd";
  const CLOSE_FENCE = "```";

  let buffer = "";
  let mode: "prose" | "tag" | "fence" = "prose";
  let cmdBuf = "";
  const commands: string[] = [];

  function findPartialSuffix(text: string, marker: string): number {
    const lower = text.toLowerCase();
    const maxLen = Math.min(text.length, marker.length - 1);
    for (let len = maxLen; len >= 1; len -= 1) {
      if (lower.endsWith(marker.slice(0, len))) return len;
    }
    return 0;
  }

  function push(chunk: string): string {
    buffer += chunk;
    let out = "";

    while (buffer.length > 0) {
      if (mode === "prose") {
        const lower = buffer.toLowerCase();
        const tagIdx = lower.indexOf(OPEN_TAG);
        const fenceIdx = lower.indexOf(OPEN_FENCE);

        // Pick earliest complete opening marker, if any.
        let nextIdx = -1;
        let nextKind: "tag" | "fence" | null = null;
        if (tagIdx >= 0 && (fenceIdx < 0 || tagIdx < fenceIdx)) {
          nextIdx = tagIdx;
          nextKind = "tag";
        } else if (fenceIdx >= 0) {
          nextIdx = fenceIdx;
          nextKind = "fence";
        }

        if (nextKind && nextIdx >= 0) {
          out += buffer.slice(0, nextIdx);
          buffer = buffer.slice(nextIdx);
          if (nextKind === "tag") {
            const gt = buffer.indexOf(">");
            if (gt < 0) break; // wait for end of opening <proxima_cmd ...>
            buffer = buffer.slice(gt + 1);
            mode = "tag";
            cmdBuf = "";
          } else {
            const nl = buffer.indexOf("\n");
            if (nl < 0) break; // wait for newline after ```proxima_cmd
            buffer = buffer.slice(nl + 1);
            mode = "fence";
            cmdBuf = "";
          }
          continue;
        }

        // No full opening marker yet — hold back any partial prefix of `<proxima_cmd` or ```` ```proxima_cmd ````.
        const hold = Math.max(
          findPartialSuffix(buffer, OPEN_TAG),
          findPartialSuffix(buffer, OPEN_FENCE),
        );
        const safeLen = buffer.length - hold;
        if (safeLen > 0) {
          out += buffer.slice(0, safeLen);
          buffer = buffer.slice(safeLen);
        }
        break;
      }

      if (mode === "tag") {
        const lower = buffer.toLowerCase();
        const closeIdx = lower.indexOf(CLOSE_TAG);
        if (closeIdx >= 0) {
          cmdBuf += buffer.slice(0, closeIdx);
          const cleaned = cmdBuf.trim();
          if (cleaned && commands.length < MAX_COMMANDS_PER_ROUND) {
            commands.push(cleaned.slice(0, MAX_COMMAND_CHARS));
          }
          buffer = buffer.slice(closeIdx + CLOSE_TAG.length);
          cmdBuf = "";
          mode = "prose";
          continue;
        }
        const hold = findPartialSuffix(buffer, CLOSE_TAG);
        const take = buffer.length - hold;
        if (take > 0) {
          cmdBuf += buffer.slice(0, take);
          buffer = buffer.slice(take);
        }
        break;
      }

      // mode === "fence"
      const closeIdx = buffer.indexOf(CLOSE_FENCE);
      if (closeIdx >= 0) {
        cmdBuf += buffer.slice(0, closeIdx);
        const cleaned = cmdBuf.trim();
        if (cleaned && commands.length < MAX_COMMANDS_PER_ROUND) {
          commands.push(cleaned.slice(0, MAX_COMMAND_CHARS));
        }
        buffer = buffer.slice(closeIdx + CLOSE_FENCE.length);
        cmdBuf = "";
        mode = "prose";
        continue;
      }
      const hold = findPartialSuffix(buffer, CLOSE_FENCE);
      const take = buffer.length - hold;
      if (take > 0) {
        cmdBuf += buffer.slice(0, take);
        buffer = buffer.slice(take);
      }
      break;
    }

    return out;
  }

  function flush(): { text: string; commands: string[] } {
    let trailing = "";
    if (mode === "prose") {
      trailing = buffer;
    } else {
      // Unclosed tag at stream end: treat captured command if valid rather than leaking raw markup.
      const cleaned = (cmdBuf + buffer).trim();
      if (cleaned && commands.length < MAX_COMMANDS_PER_ROUND) {
        commands.push(cleaned.slice(0, MAX_COMMAND_CHARS));
      }
    }
    buffer = "";
    cmdBuf = "";
    mode = "prose";
    return { text: trailing, commands: [...commands] };
  }

  return { push, flush };
}

/**
 * Pulls code files from the most recent code-bearing assistant or user message in
 * conversation history so Proxima's command prompt sees files just generated in chat.
 */
export function extractWorkspaceFilesFromHistory(
  history: readonly { content: string }[],
): GeneratedFile[] {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i];
    if (!turn?.content || !turn.content.includes("```")) continue;
    const files = extractGeneratedFiles(turn.content);
    if (files.length > 0) return files;
  }
  return [];
}

/** Executes commands sequentially against an existing persistent workspace state. */
export async function executeChatCommandsWithState(
  commands: readonly string[],
  initialState: CommandPromptState,
  options?: {
    onCommandStart?: (command: string, index: number, total: number) => void;
    onCommandFinish?: (run: ExecutedCommandRun, index: number, total: number) => void;
    stepDelayMs?: number;
  },
): Promise<{ runs: ExecutedCommandRun[]; state: CommandPromptState }> {
  let state = initialState;
  const runs: ExecutedCommandRun[] = [];
  const stepDelayMs = options?.stepDelayMs ?? 0;

  for (let i = 0; i < commands.length; i += 1) {
    const command = commands[i]!;
    options?.onCommandStart?.(command, i, commands.length);
    if (stepDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, stepDelayMs));
    }
    const cwdBefore = formatPromptCwd(state.cwd);
    const started = Date.now();
    const res = await executeCommandLine(command, state, serverCommandRuntime);
    const durationMs = Math.max(1, Date.now() - started);
    state = res.state;
    const run: ExecutedCommandRun = {
      command,
      cwd: cwdBefore,
      stdout: res.stdout,
      stderr: res.stderr,
      exitCode: res.exitCode,
      durationMs,
    };
    runs.push(run);
    options?.onCommandFinish?.(run, i, commands.length);
  }

  return { runs, state };
}

/** Executes one or more commands sequentially in a fresh isolated Proxima workspace. */
export async function executeChatCommands(
  commands: readonly string[],
  initialFiles: readonly GeneratedFile[] = [],
  options?: {
    onCommandStart?: (command: string, index: number, total: number) => void;
    onCommandFinish?: (run: ExecutedCommandRun, index: number, total: number) => void;
    stepDelayMs?: number;
  },
): Promise<{ runs: ExecutedCommandRun[]; state: CommandPromptState }> {
  return executeChatCommandsWithState(commands, createCommandPromptState(initialFiles), options);
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const remaining = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n… (${remaining} more characters truncated)`;
}

/**
 * Formats an executed command into a reload-safe Arena-AI-style collapsible terminal card
 * fenced block (` ```proxima-terminal `) rendered natively by `<Markdown />`.
 */
export function formatTerminalToolBlock(
  run: ExecutedCommandRun,
  options?: { expanded?: boolean },
): string {
  const payload: TerminalCardPayload = {
    command: run.command,
    cwd: run.cwd,
    exitCode: run.exitCode,
    durationMs: run.durationMs,
    stdout: truncateText(run.stdout, MAX_CARD_OUTPUT_CHARS),
    stderr: truncateText(run.stderr, MAX_CARD_OUTPUT_CHARS),
    ...(options?.expanded ? { expanded: true } : {}),
  };
  // Prevent accidental fence breakage if output contains triple backticks.
  const json = JSON.stringify(payload).replace(/```/g, "`\u200b``");
  return `\`\`\`proxima-terminal\n${json}\n\`\`\``;
}

/** Formats real command executions as a structured tool observation for Proxima's next round. */
export function formatToolObservationForModel(runs: readonly ExecutedCommandRun[]): string {
  return runs
    .map((run) => {
      const parts = [
        `$ ${run.command}   (cwd: ${run.cwd}, exit: ${run.exitCode}, ${run.durationMs}ms)`,
      ];
      if (run.stdout) parts.push(`STDOUT:\n${truncateText(run.stdout, MAX_MODEL_OUTPUT_CHARS)}`);
      if (run.stderr) parts.push(`STDERR:\n${truncateText(run.stderr, MAX_MODEL_OUTPUT_CHARS)}`);
      if (!run.stdout && !run.stderr) parts.push("(no output)");
      return parts.join("\n");
    })
    .join("\n\n---\n\n");
}

/** Formats real command prompt executions as a clean Markdown terminal transcript. */
export function formatTerminalTranscript(runs: readonly ExecutedCommandRun[]): string {
  const blocks = runs.map((run) => {
    const lines = [`proxima@sandbox:${run.cwd}$ ${run.command}`];
    if (run.stdout) lines.push(run.stdout);
    if (run.stderr) lines.push(`[stderr] ${run.stderr}`);
    if (!run.stdout && !run.stderr) {
      lines.push(run.exitCode === 0 ? "(completed with exit code 0)" : `(exit code ${run.exitCode})`);
    } else if (run.exitCode !== 0) {
      lines.push(`[exit code ${run.exitCode}]`);
    }
    return lines.join("\n");
  });
  return `\`\`\`bash\n${blocks.join("\n\n")}\n\`\`\``;
}
