import "server-only";
import { extractGeneratedFiles, type GeneratedFile } from "@/lib/chat/client/code-bundle";
import {
  createCommandPromptState,
  executeCommandLine,
  formatPromptCwd,
  type CommandPromptState,
} from "./command-prompt";
import { serverSandboxedJsEvaluator } from "./server-command";

export type ExecutedCommandRun = {
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
};

const SLASH_CMD_RE = /^\/(?:cmd|sh|terminal|shell|exec)\s+([\s\S]+)$/i;

/** Extracts a direct `/cmd <command>` (or `/sh`, `/terminal`, `/shell`, `/exec`) invocation. */
export function parseSlashCommand(message: string): string | null {
  const match = message.trim().match(SLASH_CMD_RE);
  return match?.[1]?.trim() || null;
}

/**
 * Detects natural-language requests asking Proxima to execute something inside
 * her command prompt / terminal (without misfiring on general chat or coding builds).
 */
export function hasCommandPromptIntent(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 1500) return false;
  if (parseSlashCommand(text)) return true;

  // Explicit mention of running/executing/testing in command prompt / terminal / shell / cmd
  const mentionsShell =
    /\b(?:command\s*prompt|terminal|shell|proxima-sh|cmd(?:\.exe)?)\b/i.test(text);
  const asksToRun =
    /\b(?:run|execute|exec|test|check|list|try|prove|show|open|use|eval|evaluate)\b/i.test(text);
  if (mentionsShell && asksToRun) return true;

  // Direct inline command syntax like `node -e ...`, `ls -la`, `uname -a`, `echo ...`
  if (/\b(?:run|execute|exec)\s+[`"']?(?:ls|tree|pwd|cat|echo|node|npm|grep|find|wc|uname|date|whoami|mkdir|touch|env|json)\b/i.test(text)) {
    return true;
  }

  return false;
}

/** Parses `<proxima_cmd>...</proxima_cmd>` tags emitted by Proxima (up to 4 commands). */
export function extractProximaCommands(text: string): string[] {
  const commands: string[] = [];
  const re = /<proxima_cmd>([\s\S]*?)<\/proxima_cmd>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const cmd = match[1]?.trim();
    if (cmd) commands.push(cmd.slice(0, 1_500));
    if (commands.length >= 4) break;
  }
  return commands;
}

/** Strips `<proxima_cmd>...</proxima_cmd>` tags from visible prose. */
export function stripProximaCommandTags(text: string): string {
  return text.replace(/<proxima_cmd>[\s\S]*?<\/proxima_cmd>/gi, "").trim();
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

/** Executes one or more commands sequentially in a shared isolated Proxima workspace. */
export async function executeChatCommands(
  commands: readonly string[],
  initialFiles: readonly GeneratedFile[] = [],
): Promise<{ runs: ExecutedCommandRun[]; state: CommandPromptState }> {
  let state = createCommandPromptState(initialFiles);
  const runs: ExecutedCommandRun[] = [];

  for (const command of commands) {
    const cwdBefore = formatPromptCwd(state.cwd);
    const res = await executeCommandLine(command, state, serverSandboxedJsEvaluator);
    state = res.state;
    runs.push({
      command,
      cwd: cwdBefore,
      stdout: res.stdout,
      stderr: res.stderr,
      exitCode: res.exitCode,
    });
  }

  return { runs, state };
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
