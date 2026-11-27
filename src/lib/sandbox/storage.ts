import { STARTER_SANDBOX_FILES, type GeneratedFile } from "@/lib/chat/client/code-bundle";

const STORAGE_KEY = "proxima.sandbox.project.v1";

export type StoredSandboxProject = {
  projectName: string;
  files: GeneratedFile[];
  updatedAt: string;
};

/** Persists a generated code bundle so `/sandbox` loads it cleanly on navigation or reload. */
export function saveSandboxProject(project: { projectName?: string; files: GeneratedFile[] }): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredSandboxProject = {
      projectName: project.projectName?.trim() || "proxima-project",
      files: project.files.length ? project.files : STARTER_SANDBOX_FILES,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore storage quota or private browsing errors */
  }
}

/** Loads the last saved sandbox project (or falls back to starter files). */
export function loadSandboxProject(): StoredSandboxProject {
  if (typeof window === "undefined") {
    return {
      projectName: "proxima-sandbox",
      files: STARTER_SANDBOX_FILES,
      updatedAt: new Date().toISOString(),
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        projectName: "proxima-sandbox",
        files: STARTER_SANDBOX_FILES,
        updatedAt: new Date().toISOString(),
      };
    }
    const parsed = JSON.parse(raw) as Partial<StoredSandboxProject>;
    const files = Array.isArray(parsed.files)
      ? parsed.files.filter(
          (f): f is GeneratedFile =>
            Boolean(f) &&
            typeof f.path === "string" &&
            typeof f.content === "string" &&
            typeof f.language === "string",
        )
      : [];
    if (files.length === 0) {
      return {
        projectName: "proxima-sandbox",
        files: STARTER_SANDBOX_FILES,
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      projectName: typeof parsed.projectName === "string" && parsed.projectName.trim() ? parsed.projectName.trim() : "proxima-project",
      files,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return {
      projectName: "proxima-sandbox",
      files: STARTER_SANDBOX_FILES,
      updatedAt: new Date().toISOString(),
    };
  }
}
