import "server-only";
import vm from "node:vm";
import {
  createCommandPromptState,
  executeCommandLine,
  type JsEvaluator,
  type VirtualFile,
} from "./command-prompt";

const JS_TIMEOUT_MS = 1_500;
const MAX_OUTPUT_CHARS = 6_000;

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/**
 * Isolated, timeout-guarded JavaScript evaluator for Proxima's server-side
 * `run_command` agent tool. Executes inside a fresh `node:vm` context with
 * zero host `process`, `require`, `fs`, or network access.
 */
export const serverSandboxedJsEvaluator: JsEvaluator = (code, files) => {
  const out: string[] = [];
  const err: string[] = [];

  const workspaceMap: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const f of files) workspaceMap[f.path] = f.content;

  const sandboxConsole = Object.freeze({
    log: (...args: unknown[]) => out.push(args.map(formatArg).join(" ")),
    info: (...args: unknown[]) => out.push(args.map(formatArg).join(" ")),
    warn: (...args: unknown[]) => err.push(args.map(formatArg).join(" ")),
    error: (...args: unknown[]) => err.push(args.map(formatArg).join(" ")),
  });

  const context = vm.createContext(
    {
      console: sandboxConsole,
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      Promise,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      __workspaceFiles: Object.freeze(workspaceMap),
    },
    {
      codeGeneration: { strings: false, wasm: false },
    },
  );

  try {
    const result: unknown = vm.runInContext(code, context, {
      timeout: JS_TIMEOUT_MS,
      filename: "proxima-sandbox.js",
    });
    if (out.length === 0 && result !== undefined) {
      out.push(formatArg(result));
    }
    return {
      stdout: out.join("\n").slice(0, MAX_OUTPUT_CHARS),
      stderr: err.join("\n").slice(0, MAX_OUTPUT_CHARS),
      exitCode: 0,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      stdout: out.join("\n").slice(0, MAX_OUTPUT_CHARS),
      stderr: [...err, msg].filter(Boolean).join("\n").slice(0, MAX_OUTPUT_CHARS),
      exitCode: 1,
    };
  }
};

/**
 * Runs a command inside Proxima's isolated command prompt with optional
 * virtual workspace files. Used by Proxima's `run_command` agent tool.
 */
export async function runProximaCommand(options: {
  command: string;
  files?: readonly VirtualFile[];
  cwd?: string;
}): Promise<{
  exitCode: number;
  cwd: string;
  stdout: string;
  stderr: string;
  files: VirtualFile[];
}> {
  const initialState = createCommandPromptState(options.files ?? [], options.cwd ?? "");
  const result = await executeCommandLine(options.command, initialState, serverSandboxedJsEvaluator);
  return {
    exitCode: result.exitCode,
    cwd: result.state.cwd,
    stdout: result.stdout.slice(0, MAX_OUTPUT_CHARS),
    stderr: result.stderr.slice(0, MAX_OUTPUT_CHARS),
    files: result.state.files,
  };
}
