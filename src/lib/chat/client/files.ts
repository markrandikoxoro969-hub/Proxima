import { LIMITS } from "@/lib/limits";

/**
 * Reading attached files in the browser. Only small TEXT files are allowed
 * (code, notes, data): their contents are sent along with your message.
 */
export const ACCEPTED_EXTENSIONS = [
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".log",
  ".env.example",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".h",
  ".cpp",
  ".cc",
  ".hpp",
  ".cs",
  ".php",
  ".sh",
  ".bash",
  ".ps1",
  ".sql",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".vue",
  ".svelte",
  ".dart",
  ".lua",
  ".r",
  ".ini",
  ".cfg",
] as const;

export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(",");

export type ReadFile = { id: string; name: string; size: number; content: string };
export type FileProblem = { name: string; reason: string };

const formatKb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** True if the text looks binary (images, PDFs, zips…). */
export function looksBinary(text: string): boolean {
  if (text.includes("\u0000")) return true;
  const sample = text.slice(0, 2000);
  if (!sample) return false;
  const replacement = sample.split("\uFFFD").length - 1; // invalid UTF-8 bytes
  return replacement / sample.length > 0.05;
}

export async function readAttachments(
  files: Iterable<File>,
  alreadyAttached: number,
): Promise<{ accepted: ReadFile[]; problems: FileProblem[] }> {
  const accepted: ReadFile[] = [];
  const problems: FileProblem[] = [];

  for (const file of files) {
    if (alreadyAttached + accepted.length >= LIMITS.attachmentsMax) {
      problems.push({ name: file.name, reason: `you can attach up to ${LIMITS.attachmentsMax} files` });
      continue;
    }
    if (file.size > LIMITS.attachmentBytesMax) {
      problems.push({ name: file.name, reason: `is ${formatKb(file.size)} (max 100 KB)` });
      continue;
    }
    if (file.size === 0) {
      problems.push({ name: file.name, reason: "is empty" });
      continue;
    }
    let content: string;
    try {
      content = await file.text();
    } catch {
      problems.push({ name: file.name, reason: "couldn't be read" });
      continue;
    }
    if (looksBinary(content)) {
      problems.push({ name: file.name, reason: "isn't a text file (images/PDFs aren't supported yet)" });
      continue;
    }
    accepted.push({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name.slice(0, LIMITS.attachmentNameMax),
      size: new TextEncoder().encode(content).length,
      content,
    });
  }
  return { accepted, problems };
}

export const formatBytes = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
