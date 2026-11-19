/**
 * Helpers for building what we send to the AI and what we store.
 */

const EXT_TO_LANG: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  ps1: "powershell",
  sql: "sql",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  xml: "xml",
  md: "markdown",
  txt: "text",
  csv: "csv",
  env: "bash",
  dockerfile: "dockerfile",
  vue: "vue",
  svelte: "svelte",
  dart: "dart",
  lua: "lua",
};

export function languageFromFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  const ext = lower.includes(".") ? lower.split(".").pop()! : "";
  return EXT_TO_LANG[ext] ?? "text";
}

/** A code fence longer than any backtick run inside the content, so files can't break out. */
function fenceFor(content: string): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

export type Attachment = { name: string; content: string };

/** The text the AI receives: the message, then each attached file in a code block. */
export function composePrompt(message: string, attachments: Attachment[] = []): string {
  if (attachments.length === 0) return message;
  const files = attachments.map(({ name, content }) => {
    const fence = fenceFor(content);
    return `--- Attached file: ${name} ---\n${fence}${languageFromFilename(name)}\n${content}\n${fence}`;
  });
  return `${message}\n\n${files.join("\n\n")}`;
}

/** What we store about attachments (not the file contents — keeps the database small). */
export function attachmentMeta(attachments: Attachment[] = []) {
  return attachments.map(({ name, content }) => ({
    name,
    size: new TextEncoder().encode(content).length,
    language: languageFromFilename(name),
  }));
}

export const DEFAULT_TITLE = "New Chat Session";

/** Sidebar title from the first message: one line, first 25 characters + "…" (as in the original app). */
export function makeTitle(message: string): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  if (!oneLine) return DEFAULT_TITLE;
  return oneLine.length > 25 ? `${oneLine.slice(0, 25).trimEnd()}…` : oneLine;
}
