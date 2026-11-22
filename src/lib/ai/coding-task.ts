import "server-only";
import { randomUUID } from "node:crypto";
import { generateReply } from "./reply";
import { AiProviderError, type AiProvider, type AiRequest } from "./types";

export type CodingFilePlan = { path: string; purpose: string };

export type CodingTaskProgress = {
  kind: "multi-file-coding";
  version: 1;
  state: "planned" | "in-progress" | "interrupted";
  files: CodingFilePlan[];
  completedFiles: string[];
  currentFile: string | null;
};

const MAX_PLANNED_FILES = 12;
/** Bounded retries avoid looping forever or consuming an entire free-tier quota. */
const MAX_FILE_REPAIRS = 2;
/** Preserve substantial prior code without overflowing a model's context window. */
const MAX_PROJECT_CONTEXT_CHARS = 400_000;
const MAX_REPAIR_CONTEXT_CHARS = 200_000;

const PLAN_INSTRUCTIONS = [
  "Plan this coding task as files, but do not write any source code yet.",
  'Return only JSON in this exact shape: {"files":[{"path":"relative/path.ext","purpose":"one short sentence"}]}.',
  `List every file needed to finish the task, in dependency order, up to ${MAX_PLANNED_FILES} files.`,
  "Prefer the smallest complete set; include essential config and tests when the request needs them.",
  "Use safe relative POSIX paths. Never include absolute paths, parent-directory segments, or duplicate paths.",
  "Do not include Markdown fences, commentary, or files the user did not ask for.",
].join("\n");

const PLAN_FORMAT_RETRY = [
  "Format correction: return one complete, valid JSON object and nothing else.",
  'It must have a non-empty "files" array; each entry must have a safe relative "path" and a short "purpose".',
  `Use at most ${MAX_PLANNED_FILES} unique paths. No Markdown fences, comments, or trailing commas.`,
].join("\n");

/** Avoid a planning round-trip for ordinary one-file code questions. */
export function isMultiFileCodingRequest(message: string): boolean {
  const explicit =
    /\b(?:multi[- ]file|multiple files|several files|file[- ]by[- ]file|all (?:the )?files|\d+\s*(?:or more\s*)?files)\b/i.test(
      message,
    );
  const paths = message.match(
    /(?:^|[\s`"'(])(?:[\w.@-]+\/)*[\w.@-]+\.(?:tsx?|jsx?|mjs|cjs|json|css|scss|py|go|rs|java|kt|mdx?|sql|html|vue|svelte|prisma|ya?ml|sh)\b/gim,
  );
  const projectBuild =
    /\b(?:build|create|scaffold|generate|implement|make)\b[\s\S]{0,120}\b(?:full[- ]stack|project|application|app|website|web app|codebase)\b/i.test(
      message,
    );
  return explicit || (paths?.length ?? 0) >= 2 || projectBuild;
}

export function parseCodingPlan(text: string): CodingFilePlan[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw invalidPlan();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw invalidPlan();
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { files?: unknown }).files)) {
    throw invalidPlan();
  }

  const files = (parsed as { files: unknown[] }).files;
  if (files.length === 0 || files.length > MAX_PLANNED_FILES) throw invalidPlan();
  const result: CodingFilePlan[] = [];
  const paths = new Set<string>();
  for (const item of files) {
    if (!item || typeof item !== "object") throw invalidPlan();
    const row = item as { path?: unknown; purpose?: unknown };
    const path = typeof row.path === "string" ? row.path.trim().replace(/^`|`$/g, "") : "";
    const purpose = typeof row.purpose === "string" ? row.purpose.trim().slice(0, 240) : "";
    if (!isSafeRelativePath(path) || paths.has(path)) throw invalidPlan();
    paths.add(path);
    result.push({ path, purpose: purpose || `Implement ${path}.` });
  }
  if (result.some(({ path }) => result.some((other) => other.path.startsWith(`${path}/`)))) {
    throw invalidPlan(); // A path cannot be both a file and a directory.
  }
  return result;
}

/** Present the plan as a folder tree without inventing a project root. */
export function formatCodingTree(files: CodingFilePlan[]): string {
  type Node = Map<string, Node | null>;
  const root: Node = new Map();
  for (const { path } of files) {
    const segments = path.split("/");
    let node = root;
    for (const [index, segment] of segments.entries()) {
      if (index === segments.length - 1) node.set(segment, null);
      else {
        if (!node.has(segment)) node.set(segment, new Map());
        node = node.get(segment) as Node;
      }
    }
  }
  const lines: string[] = [];
  const visit = (node: Node, prefix: string) => {
    const entries = [...node.entries()];
    entries.forEach(([name, children], index) => {
      const last = index === entries.length - 1;
      lines.push(`${prefix}${last ? "└── " : "├── "}${name}${children ? "/" : ""}`);
      if (children) visit(children, prefix + (last ? "    " : "│   "));
    });
  };
  visit(root, "");
  return `### Project structure (planned)\n\n\`\`\`text\n${lines.join("\n")}\n\`\`\`\n\n`;
}

/** Reads persisted JSON defensively; invalid or old progress is never resumed. */
export function readCodingTaskProgress(value: unknown): CodingTaskProgress | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<CodingTaskProgress>;
  if (row.kind !== "multi-file-coding" || row.version !== 1 || !Array.isArray(row.files)) return null;
  try {
    const files = parseCodingPlan(JSON.stringify({ files: row.files }));
    const allowed = new Set(files.map((file) => file.path));
    const completedFiles = Array.isArray(row.completedFiles)
      ? row.completedFiles.filter((path): path is string => typeof path === "string" && allowed.has(path))
      : [];
    const state = row.state === "in-progress" || row.state === "interrupted" ? row.state : "planned";
    const currentFile =
      typeof row.currentFile === "string" && allowed.has(row.currentFile) ? row.currentFile : null;
    return { kind: "multi-file-coding", version: 1, state, files, completedFiles, currentFile };
  } catch {
    return null;
  }
}

export async function planCodingTask(provider: AiProvider, request: AiRequest): Promise<CodingFilePlan[]> {
  const planRequest: AiRequest = {
    ...request,
    mode: "coding",
    system: `${request.system ?? ""}\n\n${PLAN_INSTRUCTIONS}`.trim(),
    message: `Coding task to plan:\n${request.message}`,
  };
  const text = await collectText(provider, planRequest);
  try {
    return parseCodingPlan(text);
  } catch (error) {
    if (!(error instanceof AiProviderError) || error.code !== "bad_response") throw error;
    const retryText = await collectText(provider, {
      ...planRequest,
      system: `${planRequest.system}\n\n${PLAN_FORMAT_RETRY}`,
    });
    return parseCodingPlan(retryText);
  }
}

export async function generateCodingFile(
  provider: AiProvider,
  request: AiRequest,
  {
    file,
    files,
    completedFiles,
    completedContent,
    onRepair,
  }: {
    file: CodingFilePlan;
    files: CodingFilePlan[];
    completedFiles: string[];
    completedContent: string;
    onRepair?: (attempt: number) => void;
  },
): Promise<string> {
  const marker = `<<<PROXIMA_FILE_COMPLETE:${randomUUID()}>>>`;
  const fileInstructions = [
    "Implement exactly one file from a multi-file coding task.",
    "Return one Markdown fenced code block containing the complete source file, then the exact completion marker below.",
    "Use a fence long enough that any Markdown fences inside the source cannot close it.",
    "Do not return a plan, explanations, placeholders, ellipses, or source for any other file.",
    "The file is not complete unless you include the closing code fence and the exact marker as the final nonblank line.",
    `Required final marker: ${marker}`,
  ].join("\n");
  const planText = files.map((entry) => `- ${entry.path}: ${entry.purpose}`).join("\n");
  const completedPathSet = new Set(completedFiles);
  const completedPaths = files.filter((entry) => completedPathSet.has(entry.path)).map((entry) => entry.path);
  const prompt = [
    `Original request:\n${request.message}`,
    `Planned files, in dependency order:\n${planText}`,
    completedPaths.length
      ? `Already completed and saved; do not regenerate:\n${completedPaths.join("\n")}`
      : "No files have been completed yet.",
    ...(completedContent
      ? [`Previously completed files (context only, do not reproduce):\n${projectContext(completedContent)}`]
      : []),
    `Generate only this file now:\n${file.path}\nPurpose: ${file.purpose}`,
    "Keep exported names and interfaces compatible with the files already saved above.",
  ].join("\n\n");
  let previousOutput = "";
  for (let attempt = 0; attempt <= MAX_FILE_REPAIRS; attempt++) {
    if (request.signal.aborted) throw interruptedError(request.signal);
    if (attempt > 0) onRepair?.(attempt);
    const repairPrompt = attempt
      ? [
          "The previous response was not a complete, correctly formatted file.",
          "Return the entire file again, with any missing code completed. Do not return a patch or only a suffix.",
          "Include the exact completion marker as the final line after the complete file.",
          previousOutput
            ? `Previous attempt (unverified; do not assume it is complete):\n${previousOutput.slice(0, MAX_REPAIR_CONTEXT_CHARS)}${previousOutput.length > MAX_REPAIR_CONTEXT_CHARS ? "\n[Previous attempt truncated for context.]" : ""}`
            : "The previous attempt returned no usable file.",
        ].join("\n\n")
      : "";
    try {
      previousOutput = await collectText(provider, {
        ...request,
        mode: "coding",
        system: `${request.system ?? ""}\n\n${fileInstructions}`.trim(),
        message: [prompt, repairPrompt].filter(Boolean).join("\n\n"),
      });
      return parseCodingFile(previousOutput, marker, file.path);
    } catch (error) {
      if (request.signal.aborted) throw interruptedError(request.signal);
      // Retry invalid model output only; authentication, quota and network errors
      // already have provider-level retry/fallback and should not burn more calls.
      if (
        !(error instanceof AiProviderError) ||
        error.code !== "bad_response" ||
        attempt === MAX_FILE_REPAIRS
      ) {
        throw error;
      }
    }
  }
  throw new AiProviderError(
    `The model could not complete ${file.path}. Saved files can be resumed.`,
    "bad_response",
  );
}

function parseCodingFile(raw: string, marker: string, path: string): string {
  const markerAt = raw.lastIndexOf(marker);
  if (markerAt < 0 || raw.slice(markerAt + marker.length).trim()) {
    throw new AiProviderError(
      `The model did not finish ${path}. Its progress is saved; retry to resume.`,
      "bad_response",
    );
  }
  const code = extractSource(raw.slice(0, markerAt));
  if (!code.trim()) {
    throw new AiProviderError(
      `The model returned an empty file for ${path}. Retry to resume.`,
      "bad_response",
    );
  }
  return code;
}

function projectContext(content: string): string {
  if (content.length <= MAX_PROJECT_CONTEXT_CHARS) return content;
  return `[Earlier project content omitted to fit the context budget.]\n${content.slice(-MAX_PROJECT_CONTEXT_CHARS)}`;
}

export function formatCodingFile(path: string, code: string): string {
  const language = languageForPath(path);
  const longestFence = Math.max(0, ...code.split("\n").map((line) => /^`{3,}/.exec(line)?.[0].length ?? 0));
  const fence = "`".repeat(Math.max(3, longestFence + 1));
  return `### \`${path}\`\n\n${fence}${language}\n${code.replace(/\n+$/, "")}\n${fence}\n\n`;
}

async function collectText(provider: AiProvider, request: AiRequest): Promise<string> {
  let text = "";
  for await (const delta of generateReply(provider, request)) {
    if (request.signal.aborted) throw interruptedError(request.signal);
    if (delta.type === "text") text += delta.text;
  }
  if (request.signal.aborted) throw interruptedError(request.signal);
  if (!text.trim()) throw new AiProviderError("The model returned an empty coding response", "bad_response");
  return text;
}

function extractSource(response: string): string {
  const lines = response.replace(/\r\n?/g, "\n").trim().split("\n");
  const openIndex = lines.findIndex((line) => /^\s{0,3}(`{3,}|~{3,})/.test(line));
  // Some providers omit the requested Markdown fence but still include the
  // required final completion marker. In that case the complete response body
  // is the source file; format it into a fence when it is saved for display.
  if (openIndex < 0) return lines.join("\n");
  const opening = /^\s{0,3}(`{3,}|~{3,})/.exec(lines[openIndex])?.[1];
  if (!opening) throw new AiProviderError("The model returned a malformed code fence", "bad_response");

  let closeIndex = -1;
  for (let i = openIndex + 1; i < lines.length; i++) {
    const closing = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(lines[i])?.[1];
    if (closing && closing[0] === opening[0] && closing.length >= opening.length) {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex < 0 || lines.slice(closeIndex + 1).some((line) => line.trim())) {
    throw new AiProviderError("The model returned an unfinished code fence", "bad_response");
  }
  return lines.slice(openIndex + 1, closeIndex).join("\n");
}

function isSafeRelativePath(path: string): boolean {
  if (!path || path.length > 180 || path.startsWith("/") || path.includes("\\") || path.includes("\0"))
    return false;
  const segments = path.split("/");
  return (
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..") &&
    /^[\w.@+-]+(?:\/[\w.@+-]+)*$/.test(path)
  );
}

function languageForPath(path: string): string {
  const extension = path.split("/").at(-1)?.split(".").at(-1)?.toLowerCase() ?? "";
  const languages: Record<string, string> = {
    css: "css",
    html: "html",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    mdx: "mdx",
    prisma: "prisma",
    py: "python",
    scss: "scss",
    sh: "bash",
    sql: "sql",
    svelte: "svelte",
    ts: "typescript",
    tsx: "tsx",
    vue: "vue",
    yaml: "yaml",
    yml: "yaml",
  };
  return languages[extension] ?? "";
}

function interruptedError(signal: AbortSignal): AiProviderError {
  const reason = signal.reason as { name?: string } | undefined;
  return reason?.name === "TimeoutError"
    ? new AiProviderError("The coding generation timed out", "timeout")
    : new AiProviderError("Request was cancelled", "aborted");
}

function invalidPlan(): AiProviderError {
  return new AiProviderError(
    "The model returned an invalid or incomplete file plan. Retry to resume.",
    "bad_response",
  );
}
