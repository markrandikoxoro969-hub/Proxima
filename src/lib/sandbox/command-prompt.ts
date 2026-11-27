import { sanitizeFilePath, type GeneratedFile } from "@/lib/chat/client/code-bundle";

export type VirtualFile = GeneratedFile;

export type JsEvaluator = (
  code: string,
  files: readonly VirtualFile[],
) => Promise<{ stdout: string; stderr: string; exitCode: number }> | { stdout: string; stderr: string; exitCode: number };

export type WebFetcher = (
  url: string,
) => Promise<{ ok: true; text: string; title?: string; url?: string } | { ok: false; error: string }>;

export type CommandRuntime = {
  evalJs?: JsEvaluator;
  fetchUrl?: WebFetcher;
};

export type CommandPromptState = {
  files: VirtualFile[];
  cwd: string; // "" means workspace root (/workspace), "src" means /workspace/src
  env: Record<string, string>;
  history: string[];
};

export type CommandExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  state: CommandPromptState;
  filesChanged: boolean;
  clearScreen?: boolean;
  triggerDownloadZip?: boolean;
  triggerRunPreview?: boolean;
};

export const DEFAULT_PROMPT_ENV: Record<string, string> = {
  USER: "proxima",
  HOME: "/workspace",
  SHELL: "/bin/proxima-sh",
  NODE_ENV: "development",
  TERM: "xterm-256color",
};

export function createCommandPromptState(
  files: readonly VirtualFile[],
  cwd = "",
  env: Record<string, string> = {},
): CommandPromptState {
  return {
    files: files.map((f) => ({ ...f })),
    cwd: normalizeDir(cwd),
    env: { ...DEFAULT_PROMPT_ENV, ...env },
    history: [],
  };
}

export function formatPromptCwd(cwd: string): string {
  return cwd ? `/workspace/${cwd}` : "/workspace";
}

function normalizeDir(raw: string): string {
  const cleaned = raw
    .replace(/\\/g, "/")
    .replace(/^\/workspace\/?/, "")
    .replace(/^~\/?/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!cleaned || cleaned === ".") return "";
  const parts: string[] = [];
  for (const seg of cleaned.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join("/");
}

/** Resolves a path relative to `cwd` strictly inside the virtual workspace. */
export function resolveWorkspacePath(cwd: string, target: string): string | null {
  const trimmed = target.trim();
  if (!trimmed || trimmed === "." || trimmed === "./") return cwd;
  if (trimmed === "/" || trimmed === "~" || trimmed === "/workspace") return "";
  const combined =
    trimmed.startsWith("/") || trimmed.startsWith("~")
      ? trimmed.replace(/^~\/?/, "").replace(/^\/workspace\/?/, "").replace(/^\/+/, "")
      : cwd
        ? `${cwd}/${trimmed}`
        : trimmed;
  const parts: string[] = [];
  for (const seg of combined.replace(/\\/g, "/").split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null; // cannot escape workspace root
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  const joined = parts.join("/");
  if (!joined) return "";
  return sanitizeFilePath(joined);
}

function inferLang(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "txt";
  const map: Record<string, string> = {
    html: "html",
    htm: "html",
    css: "css",
    js: "js",
    mjs: "js",
    jsx: "jsx",
    ts: "ts",
    tsx: "tsx",
    json: "json",
    svg: "svg",
    md: "md",
    py: "python",
    sh: "bash",
    txt: "txt",
  };
  return map[ext] ?? ext;
}

/** Collects implicit directories from file paths + explicit `.keep` markers. */
function listDirectoryEntries(files: readonly VirtualFile[], dir: string): { name: string; isDir: boolean; size: number }[] {
  const prefix = dir ? `${dir}/` : "";
  const dirs = new Set<string>();
  const entries = new Map<string, { name: string; isDir: boolean; size: number }>();

  for (const file of files) {
    if (prefix && !file.path.startsWith(prefix)) continue;
    const rest = prefix ? file.path.slice(prefix.length) : file.path;
    if (!rest) continue;
    const slash = rest.indexOf("/");
    if (slash >= 0) {
      const folder = rest.slice(0, slash);
      if (!dirs.has(folder)) {
        dirs.add(folder);
        entries.set(folder, { name: `${folder}/`, isDir: true, size: 0 });
      }
    } else if (rest !== ".gitkeep") {
      entries.set(rest, { name: rest, isDir: false, size: new TextEncoder().encode(file.content).length });
    }
  }

  return Array.from(entries.values()).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function hasDirectory(files: readonly VirtualFile[], dir: string): boolean {
  if (!dir) return true;
  const prefix = `${dir}/`;
  return files.some((f) => f.path.startsWith(prefix));
}

function expandEnvVars(text: string, env: Record<string, string>): string {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_m, a, b) => {
    const key = String(a ?? b ?? "");
    return env[key] ?? "";
  });
}

/** Splits a shell line into tokens honoring single quotes, double quotes, and escapes. */
function tokenizeShell(input: string, env: Record<string, string>): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let hasToken = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      } else {
        current += ch;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      } else if (ch === "\\" && i + 1 < input.length) {
        const next = input[i + 1]!;
        if (next === "n") {
          current += "\n";
          i += 1;
        } else if (next === "t") {
          current += "\t";
          i += 1;
        } else if (next === '"' || next === "\\" || next === "$") {
          current += next;
          i += 1;
        } else {
          current += ch;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      hasToken = true;
    } else if (ch === '"') {
      inDouble = true;
      hasToken = true;
    } else if (ch === "\\" && i + 1 < input.length) {
      current += input[i + 1]!;
      hasToken = true;
      i += 1;
    } else if (/\s/.test(ch)) {
      if (hasToken || current.length > 0) {
        tokens.push(expandEnvVars(current, env));
        current = "";
        hasToken = false;
      }
    } else if ((ch === ">" && input[i + 1] === ">") || ch === ">" || ch === "|") {
      if (hasToken || current.length > 0) {
        tokens.push(expandEnvVars(current, env));
        current = "";
        hasToken = false;
      }
      if (ch === ">" && input[i + 1] === ">") {
        tokens.push(">>");
        i += 1;
      } else {
        tokens.push(ch);
      }
    } else {
      current += ch;
      hasToken = true;
    }
  }
  if (hasToken || current.length > 0) {
    tokens.push(expandEnvVars(current, env));
  }
  return tokens;
}

/** Splits chained commands on top-level `&&`, `||`, and `;` outside quotes. */
function splitChainedCommands(line: string): { cmd: string; op: "&&" | "||" | ";" | null }[] {
  const parts: { cmd: string; op: "&&" | "||" | ";" | null }[] = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      buf += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      buf += ch;
      continue;
    }
    if (!inSingle && !inDouble) {
      if (ch === "&" && line[i + 1] === "&") {
        parts.push({ cmd: buf.trim(), op: "&&" });
        buf = "";
        i += 1;
        continue;
      }
      if (ch === "|" && line[i + 1] === "|") {
        parts.push({ cmd: buf.trim(), op: "||" });
        buf = "";
        i += 1;
        continue;
      }
      if (ch === ";") {
        parts.push({ cmd: buf.trim(), op: ";" });
        buf = "";
        continue;
      }
    }
    buf += ch;
  }
  if (buf.trim()) parts.push({ cmd: buf.trim(), op: null });
  return parts.filter((p) => p.cmd.length > 0);
}

function buildTree(files: readonly VirtualFile[], dir: string): string {
  const prefix = dir ? `${dir}/` : "";
  const rootLabel = dir ? `${dir}/` : "/workspace";
  const scoped = files
    .filter((f) => (!prefix || f.path.startsWith(prefix)) && !f.path.endsWith("/.gitkeep") && f.path !== ".gitkeep")
    .map((f) => (prefix ? f.path.slice(prefix.length) : f.path))
    .sort((a, b) => a.localeCompare(b));

  type Node = { children: Map<string, Node>; isFile: boolean };
  const root: Node = { children: new Map(), isFile: false };
  for (const rel of scoped) {
    const segs = rel.split("/");
    let node = root;
    for (let i = 0; i < segs.length; i += 1) {
      const seg = segs[i]!;
      let next = node.children.get(seg);
      if (!next) {
        next = { children: new Map(), isFile: i === segs.length - 1 };
        node.children.set(seg, next);
      }
      node = next;
    }
  }

  const lines: string[] = [rootLabel];
  const walk = (node: Node, indent: string) => {
    const entries = Array.from(node.children.entries()).sort((a, b) => {
      if (a[1].isFile !== b[1].isFile) return a[1].isFile ? 1 : -1;
      return a[0].localeCompare(b[0]);
    });
    entries.forEach(([name, child], idx) => {
      const last = idx === entries.length - 1;
      lines.push(`${indent}${last ? "└── " : "├── "}${name}${child.isFile ? "" : "/"}`);
      if (!child.isFile) walk(child, `${indent}${last ? "    " : "│   "}`);
    });
  };
  walk(root, "");
  return lines.join("\n");
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

const HELP_TEXT = [
  "Proxima Command Prompt (proxima-sh v1.0)",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "Files & Directories:",
  "  ls [-la] [dir]       List files and folders",
  "  tree [dir]           Show workspace directory tree",
  "  pwd / cd <dir>       Print or change current directory",
  "  cat <file>           Print file contents",
  "  head / tail [-n N]   Show first or last N lines",
  "  touch <file>         Create an empty file",
  "  mkdir <dir>          Create a folder",
  "  cp <src> <dst>       Copy a file",
  "  mv <src> <dst>       Move or rename a file",
  "  rm [-r] <path>       Delete a file or folder",
  "Search & Text:",
  "  grep [-in] <pat> [f] Search text across files (or piped input)",
  "  find [dir] [-name]   Find files in workspace",
  "  wc [file]            Count lines, words, and bytes",
  "  echo <text> [> file] Print text or write/append (> / >>) to a file",
  "Runtime & Project:",
  "  node <file|-e code>  Run JavaScript safely inside the sandbox",
  "  python <file|-c ...> Run Python scraping/text scripts inside the sandbox",
  "  pip install <pkg>    Install Python packages (e.g. beautifulsoup4 requests)",
  "  scrape <url>         Scrape clean readable text from a public website",
  "  curl <url>           Fetch a public URL (pipeable into grep / head / > file)",
  "  npm <run|test|start> Run package.json scripts or preview",
  "  json <file>          Validate and pretty-print a JSON file",
  "  run                  Re-run the live visual preview",
  "  zip                  Download the entire workspace as a .zip",
  "Shell:",
  "  env / export K=V     Inspect or set environment variables",
  "  whoami / uname / date / history / clear / help",
  "Supports pipes (|), redirects (> and >>), and chaining (&& and ;).",
].join("\n");

const KNOWN_PIP_VERSIONS: Record<string, string> = {
  bs4: "0.0.2",
  beautifulsoup4: "4.12.3",
  requests: "2.32.3",
  lxml: "5.3.0",
  httpx: "0.28.1",
  html5lib: "1.1",
  pandas: "2.2.3",
  numpy: "2.1.3",
};

function normalizeRuntime(runtime?: JsEvaluator | CommandRuntime): CommandRuntime {
  if (!runtime) return {};
  return typeof runtime === "function" ? { evalJs: runtime } : runtime;
}

async function executePipelineSegment(
  rawTokens: string[],
  stdin: string,
  state: CommandPromptState,
  runtime: CommandRuntime,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  filesChanged: boolean;
  clearScreen?: boolean;
  triggerDownloadZip?: boolean;
  triggerRunPreview?: boolean;
}> {
  if (rawTokens.length === 0) {
    return { stdout: "", stderr: "", exitCode: 0, filesChanged: false };
  }

  // Handle output redirection (`>`, `>>`) and stderr redirection (`2>&1`, `2>/dev/null`).
  let redirectMode: ">" | ">>" | null = null;
  let redirectTarget: string | null = null;
  let mergeStderr = false;
  let discardStderr = false;
  const tokens: string[] = [];
  for (let i = 0; i < rawTokens.length; i += 1) {
    const tok = rawTokens[i]!;
    if (tok === "2" && rawTokens[i + 1] === ">" && rawTokens[i + 2] === "&1") {
      mergeStderr = true;
      i += 2;
    } else if (tok === "2" && rawTokens[i + 1] === ">" && rawTokens[i + 2] === "/dev/null") {
      discardStderr = true;
      i += 2;
    } else if ((tok === ">" || tok === ">>") && i + 1 < rawTokens.length) {
      redirectMode = tok;
      redirectTarget = rawTokens[i + 1]!;
      i += 1;
    } else {
      tokens.push(tok);
    }
  }
  if (tokens.length === 0) {
    return { stdout: "", stderr: "", exitCode: 0, filesChanged: false };
  }

  const cmd = tokens[0]!.toLowerCase();
  const args = tokens.slice(1);
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  let filesChanged = false;
  let clearScreen = false;
  let triggerDownloadZip = false;
  let triggerRunPreview = false;

  const findFile = (resolved: string) => state.files.find((f) => f.path === resolved);
  const upsertFile = (resolved: string, content: string) => {
    const existing = state.files.find((f) => f.path === resolved);
    if (existing) {
      existing.content = content;
    } else {
      state.files.push({ path: resolved, language: inferLang(resolved), content });
    }
    filesChanged = true;
  };

  switch (cmd) {
    case "help":
      stdout = HELP_TEXT;
      break;

    case "clear":
    case "cls":
      clearScreen = true;
      break;

    case "pwd":
      stdout = formatPromptCwd(state.cwd);
      break;

    case "whoami":
      stdout = state.env.USER ?? "proxima";
      break;

    case "uname":
      stdout = args.includes("-a")
        ? "ProximaOS 1.0.2VBETA sandbox-x86_64 GNU/Proxima"
        : "ProximaOS";
      break;

    case "date":
      stdout = new Date().toUTCString();
      break;

    case "echo":
    case "printf":
      stdout = args.join(" ").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
      break;

    case "env":
      stdout = Object.entries(state.env)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
      break;

    case "export":
      if (args.length === 0) {
        stdout = Object.entries(state.env)
          .map(([k, v]) => `declare -x ${k}="${v}"`)
          .join("\n");
      } else {
        for (const item of args) {
          const eq = item.indexOf("=");
          if (eq <= 0) {
            stderr = `export: invalid identifier '${item}'`;
            exitCode = 1;
          } else {
            const key = item.slice(0, eq).trim();
            const val = item.slice(eq + 1);
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
              stderr = `export: invalid variable name '${key}'`;
              exitCode = 1;
            } else {
              state.env[key] = val;
            }
          }
        }
      }
      break;

    case "unset":
      for (const key of args) delete state.env[key];
      break;

    case "history":
      stdout = state.history.map((line, i) => `${String(i + 1).padStart(3, " ")}  ${line}`).join("\n");
      break;

    case "cd": {
      const target = args[0] ?? "";
      if (!target || target === "~" || target === "/") {
        state.cwd = "";
        break;
      }
      const resolved = resolveWorkspacePath(state.cwd, target);
      if (resolved === null) {
        stderr = `cd: ${target}: permission denied (outside workspace)`;
        exitCode = 1;
      } else if (resolved === "" || hasDirectory(state.files, resolved)) {
        state.cwd = resolved;
      } else if (findFile(resolved)) {
        stderr = `cd: ${target}: Not a directory`;
        exitCode = 1;
      } else {
        stderr = `cd: ${target}: No such file or directory`;
        exitCode = 1;
      }
      break;
    }

    case "ls":
    case "dir": {
      const flags = args.filter((a) => a.startsWith("-")).join("");
      const long = flags.includes("l");
      const targetArg = args.find((a) => !a.startsWith("-")) ?? "";
      const resolved = targetArg ? resolveWorkspacePath(state.cwd, targetArg) : state.cwd;
      if (resolved === null) {
        stderr = `ls: ${targetArg}: No such file or directory`;
        exitCode = 1;
        break;
      }
      const directFile = resolved ? findFile(resolved) : undefined;
      if (directFile) {
        const size = new TextEncoder().encode(directFile.content).length;
        stdout = long ? `-rw-r--r--  1 proxima  ${String(size).padStart(6, " ")}  ${directFile.path}` : directFile.path;
        break;
      }
      if (resolved && !hasDirectory(state.files, resolved)) {
        stderr = `ls: cannot access '${targetArg}': No such file or directory`;
        exitCode = 1;
        break;
      }
      const entries = listDirectoryEntries(state.files, resolved);
      if (entries.length === 0) {
        stdout = "(empty directory)";
      } else if (long) {
        stdout = entries
          .map((e) =>
            `${e.isDir ? "drwxr-xr-x" : "-rw-r--r--"}  1 proxima  ${String(e.size).padStart(6, " ")}  ${e.name}`,
          )
          .join("\n");
      } else {
        stdout = entries.map((e) => e.name).join("   ");
      }
      break;
    }

    case "tree": {
      const targetArg = args.find((a) => !a.startsWith("-")) ?? "";
      const resolved = targetArg ? resolveWorkspacePath(state.cwd, targetArg) : state.cwd;
      if (resolved === null || (resolved && !hasDirectory(state.files, resolved))) {
        stderr = `tree: ${targetArg}: No such directory`;
        exitCode = 1;
      } else {
        stdout = buildTree(state.files, resolved);
      }
      break;
    }

    case "cat":
    case "type": {
      if (args.length === 0) {
        stdout = stdin;
        break;
      }
      const chunks: string[] = [];
      for (const arg of args) {
        const resolved = resolveWorkspacePath(state.cwd, arg);
        const file = resolved ? findFile(resolved) : undefined;
        if (!file) {
          stderr = `cat: ${arg}: No such file`;
          exitCode = 1;
          break;
        }
        chunks.push(file.content);
      }
      if (exitCode === 0) stdout = chunks.join("\n");
      break;
    }

    case "head":
    case "tail": {
      let count = 10;
      const targets: string[] = [];
      for (let i = 0; i < args.length; i += 1) {
        if (args[i] === "-n" && args[i + 1]) {
          count = Math.max(1, Number.parseInt(args[i + 1]!, 10) || 10);
          i += 1;
        } else if (/^-\d+$/.test(args[i]!)) {
          count = Math.max(1, Number.parseInt(args[i]!.slice(1), 10) || 10);
        } else {
          targets.push(args[i]!);
        }
      }
      let content = stdin;
      if (targets.length > 0) {
        const resolved = resolveWorkspacePath(state.cwd, targets[0]!);
        const file = resolved ? findFile(resolved) : undefined;
        if (!file) {
          stderr = `${cmd}: ${targets[0]}: No such file`;
          exitCode = 1;
          break;
        }
        content = file.content;
      }
      const lines = content.split("\n");
      stdout = (cmd === "head" ? lines.slice(0, count) : lines.slice(-count)).join("\n");
      break;
    }

    case "wc": {
      const targets = args.filter((a) => !a.startsWith("-"));
      const formatCounts = (text: string, label?: string) => {
        const lines = text ? text.split("\n").length : 0;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const bytes = new TextEncoder().encode(text).length;
        return `${String(lines).padStart(5, " ")} ${String(words).padStart(6, " ")} ${String(bytes).padStart(7, " ")}${label ? ` ${label}` : ""}`;
      };
      if (targets.length === 0) {
        stdout = formatCounts(stdin);
      } else {
        const rows: string[] = [];
        for (const t of targets) {
          const resolved = resolveWorkspacePath(state.cwd, t);
          const file = resolved ? findFile(resolved) : undefined;
          if (!file) {
            stderr = `wc: ${t}: No such file`;
            exitCode = 1;
            break;
          }
          rows.push(formatCounts(file.content, file.path));
        }
        if (exitCode === 0) stdout = rows.join("\n");
      }
      break;
    }

    case "grep": {
      let ignoreCase = false;
      let lineNumbers = false;
      const positional: string[] = [];
      for (const a of args) {
        if (a.startsWith("-") && a.length > 1) {
          if (a.includes("i")) ignoreCase = true;
          if (a.includes("n")) lineNumbers = true;
        } else {
          positional.push(a);
        }
      }
      const pattern = positional[0];
      if (!pattern) {
        stderr = "grep: usage: grep [-in] <pattern> [file...]";
        exitCode = 1;
        break;
      }
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, ignoreCase ? "i" : "");
      } catch {
        stderr = `grep: invalid pattern '${pattern}'`;
        exitCode = 1;
        break;
      }
      const matches: string[] = [];
      const fileArgs = positional.slice(1);
      if (fileArgs.length === 0 && stdin) {
        stdin.split("\n").forEach((line, idx) => {
          if (regex.test(line)) matches.push(lineNumbers ? `${idx + 1}:${line}` : line);
        });
      } else {
        const targets: VirtualFile[] = [];
        if (fileArgs.length === 0) {
          targets.push(...state.files.filter((f) => !f.path.endsWith(".gitkeep")));
        } else {
          for (const fa of fileArgs) {
            if (fa.includes("*")) {
              const rx = globToRegex(fa);
              targets.push(...state.files.filter((f) => rx.test(f.path) || rx.test(f.path.split("/").pop() ?? "")));
            } else {
              const resolved = resolveWorkspacePath(state.cwd, fa);
              const file = resolved ? findFile(resolved) : undefined;
              if (file) targets.push(file);
            }
          }
        }
        const multi = targets.length > 1;
        for (const f of targets) {
          f.content.split("\n").forEach((line, idx) => {
            if (regex.test(line)) {
              const prefix = `${multi ? `${f.path}:` : ""}${lineNumbers ? `${idx + 1}:` : ""}`;
              matches.push(`${prefix}${line}`);
            }
          });
        }
      }
      stdout = matches.join("\n");
      if (matches.length === 0) exitCode = 1;
      break;
    }

    case "find": {
      let rootArg = "";
      let namePattern: string | null = null;
      for (let i = 0; i < args.length; i += 1) {
        if (args[i] === "-name" && args[i + 1]) {
          namePattern = args[i + 1]!;
          i += 1;
        } else if (!args[i]!.startsWith("-") && !rootArg) {
          rootArg = args[i]!;
        }
      }
      const base = rootArg ? resolveWorkspacePath(state.cwd, rootArg) : state.cwd;
      if (base === null) {
        stderr = `find: '${rootArg}': No such directory`;
        exitCode = 1;
        break;
      }
      const prefix = base ? `${base}/` : "";
      const rx = namePattern ? globToRegex(namePattern) : null;
      const found = state.files
        .filter((f) => !f.path.endsWith(".gitkeep") && (!prefix || f.path.startsWith(prefix)))
        .filter((f) => !rx || rx.test(f.path.split("/").pop() ?? "") || rx.test(f.path))
        .map((f) => `./${f.path}`)
        .sort((a, b) => a.localeCompare(b));
      stdout = found.join("\n");
      break;
    }

    case "touch": {
      if (args.length === 0) {
        stderr = "touch: missing file operand";
        exitCode = 1;
        break;
      }
      for (const arg of args) {
        const resolved = resolveWorkspacePath(state.cwd, arg);
        if (!resolved) {
          stderr = `touch: invalid path '${arg}'`;
          exitCode = 1;
          break;
        }
        if (!findFile(resolved)) upsertFile(resolved, "");
      }
      break;
    }

    case "mkdir": {
      const targets = args.filter((a) => !a.startsWith("-"));
      if (targets.length === 0) {
        stderr = "mkdir: missing directory operand";
        exitCode = 1;
        break;
      }
      for (const arg of targets) {
        const resolved = resolveWorkspacePath(state.cwd, arg);
        if (!resolved) {
          stderr = `mkdir: invalid path '${arg}'`;
          exitCode = 1;
          break;
        }
        if (!hasDirectory(state.files, resolved)) {
          upsertFile(`${resolved}/.gitkeep`, "");
        }
      }
      break;
    }

    case "cp": {
      if (args.length < 2) {
        stderr = "cp: usage: cp <source> <dest>";
        exitCode = 1;
        break;
      }
      const src = resolveWorkspacePath(state.cwd, args[0]!);
      const dst = resolveWorkspacePath(state.cwd, args[1]!);
      const file = src ? findFile(src) : undefined;
      if (!file || !dst) {
        stderr = `cp: cannot copy '${args[0]}' to '${args[1]}'`;
        exitCode = 1;
        break;
      }
      upsertFile(dst, file.content);
      break;
    }

    case "mv": {
      if (args.length < 2) {
        stderr = "mv: usage: mv <source> <dest>";
        exitCode = 1;
        break;
      }
      const src = resolveWorkspacePath(state.cwd, args[0]!);
      const dst = resolveWorkspacePath(state.cwd, args[1]!);
      const file = src ? findFile(src) : undefined;
      if (!file || !dst) {
        stderr = `mv: cannot move '${args[0]}' to '${args[1]}'`;
        exitCode = 1;
        break;
      }
      upsertFile(dst, file.content);
      state.files = state.files.filter((f) => f.path !== src);
      filesChanged = true;
      break;
    }

    case "rm": {
      const recursive = args.some((a) => a.startsWith("-") && (a.includes("r") || a.includes("R")));
      const targets = args.filter((a) => !a.startsWith("-"));
      if (targets.length === 0) {
        stderr = "rm: missing operand";
        exitCode = 1;
        break;
      }
      for (const target of targets) {
        const resolved = resolveWorkspacePath(state.cwd, target);
        if (!resolved) {
          stderr = `rm: cannot remove '${target}'`;
          exitCode = 1;
          break;
        }
        const before = state.files.length;
        if (findFile(resolved)) {
          state.files = state.files.filter((f) => f.path !== resolved);
        } else if (hasDirectory(state.files, resolved)) {
          if (!recursive) {
            stderr = `rm: cannot remove '${target}': Is a directory (use rm -r)`;
            exitCode = 1;
            break;
          }
          const prefix = `${resolved}/`;
          state.files = state.files.filter((f) => !f.path.startsWith(prefix));
        } else {
          stderr = `rm: cannot remove '${target}': No such file or directory`;
          exitCode = 1;
          break;
        }
        if (state.files.length !== before) filesChanged = true;
      }
      break;
    }

    case "json": {
      const target = args[0];
      let raw = stdin;
      if (target) {
        const resolved = resolveWorkspacePath(state.cwd, target);
        const file = resolved ? findFile(resolved) : undefined;
        if (!file) {
          stderr = `json: ${target}: No such file`;
          exitCode = 1;
          break;
        }
        raw = file.content;
      }
      try {
        stdout = JSON.stringify(JSON.parse(raw), null, 2);
      } catch (err) {
        stderr = `json: ${err instanceof Error ? err.message : "Invalid JSON"}`;
        exitCode = 1;
      }
      break;
    }

    case "node": {
      if (args[0] === "-v" || args[0] === "--version") {
        stdout = "v22.14.0 (Proxima Sandbox JS Runtime)";
        break;
      }
      let code = "";
      if (args[0] === "-e" || args[0] === "--eval") {
        code = args.slice(1).join(" ");
      } else if (args[0]) {
        const resolved = resolveWorkspacePath(state.cwd, args[0]);
        const file = resolved ? findFile(resolved) : undefined;
        if (!file) {
          stderr = `node: cannot find module '${args[0]}'`;
          exitCode = 1;
          break;
        }
        code = file.content;
      } else if (stdin) {
        code = stdin;
      } else {
        stderr = 'node: usage: node <file.js> or node -e "console.log(2 + 2)"';
        exitCode = 1;
        break;
      }

      if (!runtime.evalJs) {
        stderr = "node: JavaScript evaluator is not attached in this environment.";
        exitCode = 1;
        break;
      }

      const res = await runtime.evalJs(code, state.files);
      stdout = res.stdout;
      stderr = res.stderr;
      exitCode = res.exitCode;
      break;
    }

    case "scrape":
    case "fetch":
    case "curl": {
      // Parse standard curl flags (`-s`, `-S`, `-L`, `-k`, `-f`, `-i`, `-I`, `-o <file>`, `-H <hdr>`, `-A <ua>`).
      let outFile: string | null = null;
      let targetUrl: string | undefined;
      for (let i = 0; i < args.length; i += 1) {
        const a = args[i]!;
        if ((a === "-o" || a === "--output") && i + 1 < args.length) {
          outFile = args[i + 1]!;
          i += 1;
        } else if (
          (a === "-H" ||
            a === "--header" ||
            a === "-A" ||
            a === "--user-agent" ||
            a === "-X" ||
            a === "--request" ||
            a === "-m" ||
            a === "--max-time") &&
          i + 1 < args.length
        ) {
          i += 1;
        } else if (a.startsWith("-")) {
          continue;
        } else if (!targetUrl || /^https?:\/\//i.test(a)) {
          targetUrl = a;
        }
      }
      if (!targetUrl) {
        stderr = `${cmd}: usage: ${cmd} https://example.com`;
        exitCode = 1;
        break;
      }
      const normalizedUrl = /^https?:\/\//i.test(targetUrl) ? targetUrl : `https://${targetUrl}`;
      if (!runtime.fetchUrl) {
        stderr = `${cmd}: live web fetching is only available inside Proxima server chat commands.`;
        exitCode = 1;
        break;
      }
      const fetched = await runtime.fetchUrl(normalizedUrl);
      if (!fetched.ok) {
        stderr = `${cmd}: ${fetched.error}`;
        exitCode = 1;
      } else if (outFile) {
        const resolved = resolveWorkspacePath(state.cwd, outFile);
        if (!resolved) {
          stderr = `${cmd}: invalid output path: ${outFile}`;
          exitCode = 1;
        } else {
          upsertFile(resolved, fetched.text);
          stdout = `Saved ${fetched.text.length} chars from ${normalizedUrl} to ${resolved}`;
        }
      } else {
        stdout = fetched.text;
      }
      break;
    }

    case "sort": {
      const reverse = args.includes("-r");
      const unique = args.includes("-u");
      const target = args.find((a) => !a.startsWith("-"));
      const source = target ? (findFile(resolveWorkspacePath(state.cwd, target) ?? "")?.content ?? "") : stdin;
      let lines = source.split(/\r?\n/);
      lines.sort((a, b) => (reverse ? b.localeCompare(a) : a.localeCompare(b)));
      if (unique) lines = Array.from(new Set(lines));
      stdout = lines.join("\n");
      break;
    }

    case "uniq": {
      const target = args.find((a) => !a.startsWith("-"));
      const source = target ? (findFile(resolveWorkspacePath(state.cwd, target) ?? "")?.content ?? "") : stdin;
      const outLines: string[] = [];
      for (const line of source.split(/\r?\n/)) {
        if (outLines[outLines.length - 1] !== line) outLines.push(line);
      }
      stdout = outLines.join("\n");
      break;
    }

    case "which": {
      const name = args[0];
      stdout = name ? `/bin/${name}` : "";
      exitCode = name ? 0 : 1;
      break;
    }

    case "true":
      exitCode = 0;
      break;

    case "false":
      exitCode = 1;
      break;

    case "pip":
    case "pip3": {
      const sub = args[0]?.toLowerCase() ?? "";
      const installed = new Set(
        (state.env.PIP_PACKAGES ?? "")
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      );
      if (sub === "--version" || sub === "-v") {
        stdout = "pip 24.3.1 from /workspace/.venv/lib/python3.12/site-packages/pip (python 3.12)";
        break;
      }
      if (sub === "list" || sub === "freeze") {
        if (installed.size === 0) {
          stdout = "Package         Version\n--------------- -------\npip             24.3.1";
        } else {
          stdout = [
            "Package         Version",
            "--------------- -------",
            ...Array.from(installed).map((pkg) => `${pkg.padEnd(15, " ")} ${KNOWN_PIP_VERSIONS[pkg] ?? "1.0.0"}`),
          ].join("\n");
        }
        break;
      }
      if (sub === "install") {
        const pkgs = args
          .slice(1)
          .filter((a) => !a.startsWith("-"))
          .map((p) => p.split(/[=<>~]/)[0]!.trim().toLowerCase())
          .filter(Boolean);
        if (pkgs.length === 0) {
          stderr = "ERROR: You must give at least one requirement to install";
          exitCode = 1;
          break;
        }
        const newlyAdded: string[] = [];
        const lines: string[] = [];
        for (const pkg of pkgs) {
          const resolvedPkg = pkg === "bs4" ? "beautifulsoup4" : pkg;
          const ver = KNOWN_PIP_VERSIONS[resolvedPkg] ?? "1.0.0";
          if (installed.has(resolvedPkg)) {
            lines.push(`Requirement already satisfied: ${resolvedPkg} (${ver})`);
          } else {
            installed.add(resolvedPkg);
            if (pkg === "bs4") installed.add("bs4");
            newlyAdded.push(`${resolvedPkg}-${ver}`);
            lines.push(`Collecting ${resolvedPkg}`);
            lines.push(`  Downloading ${resolvedPkg}-${ver}-py3-none-any.whl`);
          }
        }
        state.env.PIP_PACKAGES = Array.from(installed).join(",");
        if (newlyAdded.length > 0) {
          lines.push(`Successfully installed ${newlyAdded.join(" ")}`);
        }
        stdout = lines.join("\n");
        break;
      }
      stdout = "Usage: pip install <package> | pip list";
      break;
    }

    case "python":
    case "python3": {
      if (args[0] === "--version" || args[0] === "-v" || args[0] === "-V") {
        stdout = "Python 3.12.7 (Proxima Sandbox)";
        break;
      }
      let pyCode = "";
      if (args[0] === "-c") {
        pyCode = args.slice(1).join(" ");
      } else if (args[0]) {
        const resolved = resolveWorkspacePath(state.cwd, args[0]);
        const file = resolved ? findFile(resolved) : undefined;
        if (!file) {
          stderr = `python3: can't open file '${args[0]}': [Errno 2] No such file or directory`;
          exitCode = 1;
          break;
        }
        pyCode = file.content;
      } else if (stdin) {
        pyCode = stdin;
      } else {
        stderr = 'python3: usage: python3 <script.py> or python3 -c "<code>"';
        exitCode = 1;
        break;
      }

      // Detect URL scraping inside Python scripts (requests + BeautifulSoup / urllib)
      const urlMatch = pyCode.match(/https?:\/\/[^\s"'`)<>]+/i);
      if (urlMatch && runtime.fetchUrl) {
        const fetched = await runtime.fetchUrl(urlMatch[0]);
        if (!fetched.ok) {
          stderr = `python3: RequestError: ${fetched.error}`;
          exitCode = 1;
          break;
        }
        // Honor optional `open("output.txt", "w")` file writes inside the script
        const writeMatch = pyCode.match(/open\(\s*["']([^"']+)["']\s*,\s*["']w[^"']*["']/);
        if (writeMatch?.[1]) {
          const outPath = resolveWorkspacePath(state.cwd, writeMatch[1]);
          if (outPath) upsertFile(outPath, fetched.text);
        }
        stdout = fetched.text;
        break;
      }

      // Lightweight safe evaluator for simple print(...) Python snippets
      const printMatches = Array.from(pyCode.matchAll(/print\(\s*(?:(["'])([\s\S]*?)\1|([^)]+))\s*\)/g));
      if (printMatches.length > 0) {
        const printed: string[] = [];
        for (const m of printMatches) {
          if (m[2] !== undefined) {
            printed.push(m[2]);
          } else if (m[3] && runtime.evalJs && /^[\d\s+\-*/().%]+$/.test(m[3].trim())) {
            const evalRes = await runtime.evalJs(`console.log(${m[3].trim()})`, state.files);
            printed.push(evalRes.stdout || m[3].trim());
          } else if (m[3]) {
            printed.push(m[3].trim());
          }
        }
        stdout = printed.join("\n");
        break;
      }

      stderr = "python3: For full script execution in sandbox, use `scrape <url>`, `curl <url>`, `python3` with a URL, or `node -e`.";
      exitCode = 1;
      break;
    }

    case "npm": {
      const sub = args[0]?.toLowerCase() ?? "";
      if (sub === "-v" || sub === "--version") {
        stdout = "10.9.2 (Proxima Sandbox)";
        break;
      }
      if (sub === "start" || sub === "dev") {
        triggerRunPreview = true;
        stdout = "Rebuilding and starting live sandbox preview…";
        break;
      }
      if (sub === "run" || sub === "test") {
        const scriptName = sub === "test" ? "test" : args[1] ?? "";
        const pkgFile = findFile("package.json");
        if (pkgFile) {
          try {
            const pkg = JSON.parse(pkgFile.content) as { scripts?: Record<string, string> };
            const scripts = pkg.scripts ?? {};
            if (!scriptName) {
              stdout =
                Object.keys(scripts).length > 0
                  ? `Available scripts:\n${Object.entries(scripts)
                      .map(([k, v]) => `  ${k}: ${v}`)
                      .join("\n")}`
                  : "No scripts defined in package.json.";
              break;
            }
            const scriptCmd = scripts[scriptName];
            if (!scriptCmd) {
              stderr = `npm error Missing script: "${scriptName}"`;
              exitCode = 1;
              break;
            }
            const nested = await executeCommandLine(scriptCmd, state, runtime);
            stdout = `> ${scriptName}\n> ${scriptCmd}\n${nested.stdout}`.trim();
            stderr = nested.stderr;
            exitCode = nested.exitCode;
            filesChanged = filesChanged || nested.filesChanged;
            break;
          } catch {
            stderr = "npm error: package.json is not valid JSON";
            exitCode = 1;
            break;
          }
        }
        if (sub === "test") {
          const jsFiles = state.files.filter((f) => /\.(m?js|cjs)$/i.test(f.path));
          stdout = `Verified ${state.files.length} workspace file(s) (${jsFiles.length} JS). Run \`node <file.js>\` to execute a script directly.`;
          break;
        }
        stderr = "npm error: no package.json found in workspace.";
        exitCode = 1;
        break;
      }
      stdout = "Proxima npm helper: try `npm start`, `npm test`, or `npm run <script>`.";
      break;
    }

    case "run":
    case "preview":
      triggerRunPreview = true;
      stdout = "Refreshing live preview…";
      break;

    case "zip":
    case "download":
      triggerDownloadZip = true;
      stdout = `Packaging ${state.files.filter((f) => !f.path.endsWith(".gitkeep")).length} file(s) into a .zip archive…`;
      break;

    default:
      stderr = `proxima-sh: ${cmd}: command not found (type 'help' to see available commands)`;
      exitCode = 127;
      break;
  }

  if (discardStderr) {
    stderr = "";
  } else if (mergeStderr && stderr) {
    stdout = stdout ? `${stdout}\n${stderr}` : stderr;
    stderr = "";
  }

  // Apply stdout redirection if requested (`>` or `>>`).
  if (redirectMode && redirectTarget && exitCode === 0) {
    if (redirectTarget === "/dev/null") {
      stdout = "";
    } else {
      const resolved = resolveWorkspacePath(state.cwd, redirectTarget);
      if (!resolved) {
        return {
          stdout: "",
          stderr: `proxima-sh: ${redirectTarget}: invalid path`,
          exitCode: 1,
          filesChanged,
        };
      }
      const existing = findFile(resolved);
      const nextContent =
        redirectMode === ">>" && existing
          ? `${existing.content}${existing.content.endsWith("\n") || !existing.content ? "" : "\n"}${stdout}`
          : stdout;
      upsertFile(resolved, nextContent);
      stdout = "";
    }
  }

  return {
    stdout,
    stderr,
    exitCode,
    filesChanged,
    clearScreen,
    triggerDownloadZip,
    triggerRunPreview,
  };
}

/**
 * Executes a full command line (supporting `;`, `&&`, `|`, `>`, `>>`) inside
 * Proxima's sandboxed virtual workspace.
 */
export async function executeCommandLine(
  input: string,
  prevState: CommandPromptState,
  runtimeOrEval?: JsEvaluator | CommandRuntime,
): Promise<CommandExecutionResult> {
  const runtime = normalizeRuntime(runtimeOrEval);
  const trimmed = input.trim();
  const state: CommandPromptState = {
    files: prevState.files.map((f) => ({ ...f })),
    cwd: prevState.cwd,
    env: { ...prevState.env },
    history: trimmed ? [...prevState.history.slice(-99), trimmed] : [...prevState.history],
  };

  if (!trimmed) {
    return { stdout: "", stderr: "", exitCode: 0, state, filesChanged: false };
  }

  const chained = splitChainedCommands(trimmed);
  const stdouts: string[] = [];
  const stderrs: string[] = [];
  let lastExit = 0;
  let filesChanged = false;
  let clearScreen = false;
  let triggerDownloadZip = false;
  let triggerRunPreview = false;

  for (const part of chained) {
    const allTokens = tokenizeShell(part.cmd, state.env);
    // Split pipeline segments on `|`
    const segments: string[][] = [];
    let seg: string[] = [];
    for (const tok of allTokens) {
      if (tok === "|") {
        segments.push(seg);
        seg = [];
      } else {
        seg.push(tok);
      }
    }
    if (seg.length > 0) segments.push(seg);

    let pipeInput = "";
    let segExit = 0;
    for (const segTokens of segments) {
      const res = await executePipelineSegment(segTokens, pipeInput, state, runtime);
      pipeInput = res.stdout;
      if (res.stderr) stderrs.push(res.stderr);
      segExit = res.exitCode;
      filesChanged = filesChanged || res.filesChanged;
      clearScreen = clearScreen || Boolean(res.clearScreen);
      triggerDownloadZip = triggerDownloadZip || Boolean(res.triggerDownloadZip);
      triggerRunPreview = triggerRunPreview || Boolean(res.triggerRunPreview);
      if (segExit !== 0) break;
    }

    if (pipeInput) stdouts.push(pipeInput);
    lastExit = segExit;
    if (part.op === "&&" && lastExit !== 0) break;
    if (part.op === "||" && lastExit === 0) break;
  }

  return {
    stdout: stdouts.join("\n"),
    stderr: stderrs.join("\n"),
    exitCode: lastExit,
    state,
    filesChanged,
    clearScreen,
    triggerDownloadZip,
    triggerRunPreview,
  };
}
