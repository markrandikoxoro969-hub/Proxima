"use client";

import {
  ArrowClockwise,
  Check,
  Code,
  Copy,
  Desktop,
  DeviceMobile,
  DeviceTablet,
  DownloadSimple,
  FileCode,
  Plus,
  TerminalWindow,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  buildSandboxDocument,
  sanitizeFilePath,
  STARTER_SANDBOX_FILES,
  type GeneratedFile,
} from "@/lib/chat/client/code-bundle";
import { cn } from "@/lib/cn";

type ConsoleEntry = {
  id: number;
  level: "log" | "info" | "warn" | "error";
  text: string;
};

type LayoutMode = "split" | "code" | "preview";
type ViewportSize = "desktop" | "tablet" | "mobile";

export function CodeSandboxModal({
  open,
  initialFiles,
  projectName = "proxima-project",
  onClose,
}: {
  open: boolean;
  initialFiles: GeneratedFile[];
  projectName?: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [files, setFiles] = useState<GeneratedFile[]>(() =>
    initialFiles.length ? initialFiles : STARTER_SANDBOX_FILES,
  );
  const [activePath, setActivePath] = useState<string>(
    () => (initialFiles[0] ?? STARTER_SANDBOX_FILES[0])!.path,
  );
  const [layout, setLayout] = useState<LayoutMode>("split");
  const [viewport, setViewport] = useState<ViewportSize>("desktop");
  const [runCounter, setRunCounter] = useState(1);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [addingFile, setAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const logSeq = useRef(1);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const runId = `run-${runCounter}`;

  // Receive sandboxed iframe console logs safely via postMessage
  useEffect(() => {
    if (!open) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { __proximaSandbox?: boolean; runId?: string; level?: string; text?: string }
        | null
        | undefined;
      if (!data || !data.__proximaSandbox || data.runId !== runId) return;
      const level =
        data.level === "error" || data.level === "warn" || data.level === "info"
          ? data.level
          : "log";
      setLogs((prev) => [
        ...prev.slice(-99),
        { id: logSeq.current++, level, text: String(data.text ?? "") },
      ]);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, runId]);

  // Debounced live srcDoc compilation while typing
  const [compiledFiles, setCompiledFiles] = useState<GeneratedFile[]>(files);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setCompiledFiles(files);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [open, files]);

  const srcDoc = useMemo(
    () => buildSandboxDocument(compiledFiles, runId),
    [compiledFiles, runId],
  );

  const activeFile = files.find((f) => f.path === activePath) ?? files[0];

  const updateActiveContent = (content: string) => {
    if (!activeFile) return;
    setFiles((prev) =>
      prev.map((file) => (file.path === activeFile.path ? { ...file, content } : file)),
    );
  };

  const rerun = useCallback(() => {
    setLogs([]);
    setCompiledFiles(files);
    setRunCounter((c) => c + 1);
  }, [files]);

  const addNewFile = () => {
    const safe = sanitizeFilePath(newFileName);
    if (!safe) return;
    if (files.some((f) => f.path === safe)) {
      setActivePath(safe);
      setAddingFile(false);
      setNewFileName("");
      return;
    }
    const ext = safe.includes(".") ? safe.slice(safe.lastIndexOf(".") + 1).toLowerCase() : "txt";
    const created: GeneratedFile = { path: safe, language: ext, content: "" };
    setFiles((prev) => [...prev, created]);
    setActivePath(safe);
    setAddingFile(false);
    setNewFileName("");
  };

  const deleteFile = (path: string) => {
    if (files.length <= 1) return;
    setFiles((prev) => {
      const next = prev.filter((f) => f.path !== path);
      if (activePath === path && next[0]) setActivePath(next[0].path);
      return next;
    });
  };

  const copyActiveFile = async () => {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopiedPath(activeFile.path);
      window.setTimeout(() => setCopiedPath(null), 1500);
    } catch {
      /* ignore clipboard denial */
    }
  };

  const handleDownloadZip = async () => {
    if (!files.length || downloadingZip) return;
    setDownloadingZip(true);
    try {
      const { downloadFilesAsZip } = await import("@/lib/chat/client/zip");
      const slug =
        projectName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 48) || "proxima-project";
      downloadFilesAsZip(
        files.map((f) => ({ path: f.path, content: f.content })),
        `${slug}.zip`,
      );
    } finally {
      setDownloadingZip(false);
    }
  };

  if (!open) return null;

  const errorCount = logs.filter((l) => l.level === "error").length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
    >
      {/* Frosted backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
      />

      {/* Sandbox window */}
      <div className="relative z-10 flex h-[min(92dvh,54rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl glass-dialog">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-inverse text-on-inverse">
              <TerminalWindow weight="bold" className="size-4.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-sm font-black tracking-tight text-fg">
                Proxima Sandbox
              </h2>
              <p className="text-[11px] font-medium text-subtle">
                {files.length} {files.length === 1 ? "file" : "files"} · isolated live preview
              </p>
            </div>
          </div>

          {/* Layout & Viewport controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div
              role="group"
              aria-label="Sandbox layout"
              className="flex rounded-full glass-pill p-0.5 text-[11px] font-extrabold"
            >
              {(["split", "code", "preview"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLayout(mode)}
                  aria-pressed={layout === mode}
                  className={cn(
                    "rounded-full px-2.5 py-1 capitalize transition-colors",
                    layout === mode
                      ? "bg-inverse text-on-inverse"
                      : "text-muted hover:text-fg",
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>

            {layout !== "code" && (
              <div
                role="group"
                aria-label="Preview viewport"
                className="hidden rounded-full glass-pill p-0.5 sm:flex"
              >
                <button
                  type="button"
                  onClick={() => setViewport("desktop")}
                  aria-label="Desktop preview"
                  aria-pressed={viewport === "desktop"}
                  className={cn(
                    "rounded-full p-1.5 transition-colors",
                    viewport === "desktop" ? "bg-inverse text-on-inverse" : "text-muted hover:text-fg",
                  )}
                >
                  <Desktop weight="bold" className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setViewport("tablet")}
                  aria-label="Tablet preview"
                  aria-pressed={viewport === "tablet"}
                  className={cn(
                    "rounded-full p-1.5 transition-colors",
                    viewport === "tablet" ? "bg-inverse text-on-inverse" : "text-muted hover:text-fg",
                  )}
                >
                  <DeviceTablet weight="bold" className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setViewport("mobile")}
                  aria-label="Mobile preview"
                  aria-pressed={viewport === "mobile"}
                  className={cn(
                    "rounded-full p-1.5 transition-colors",
                    viewport === "mobile" ? "bg-inverse text-on-inverse" : "text-muted hover:text-fg",
                  )}
                >
                  <DeviceMobile weight="bold" className="size-3.5" aria-hidden />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={rerun}
              aria-label="Re-run sandbox"
              title="Re-run sandbox"
              className="inline-flex h-8 items-center gap-1.5 rounded-full glass-pill px-3 text-xs font-extrabold text-fg transition-colors hover:bg-surface-hover"
            >
              <ArrowClockwise weight="bold" className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Run</span>
            </button>

            <button
              type="button"
              onClick={() => void handleDownloadZip()}
              disabled={downloadingZip}
              aria-label="Download project as zip"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-inverse px-3 text-xs font-extrabold text-on-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <DownloadSimple weight="bold" className="size-3.5" aria-hidden />
              <span>{downloadingZip ? "Zipping…" : "Download .zip"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close sandbox"
              className="inline-flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <X weight="bold" className="size-4.5" aria-hidden />
            </button>
          </div>
        </div>

        {/* Main workspace */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* File Explorer Sidebar (visible in split or code modes) */}
          {layout !== "preview" && (
            <aside className="flex shrink-0 flex-col border-b border-line md:w-52 md:border-r md:border-b-0">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[10px] font-extrabold tracking-[0.18em] text-subtle uppercase">
                  Files
                </span>
                <button
                  type="button"
                  onClick={() => setAddingFile((v) => !v)}
                  aria-label="Add new file"
                  className="inline-flex size-6 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-fg"
                >
                  <Plus weight="bold" className="size-3.5" aria-hidden />
                </button>
              </div>

              {addingFile && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addNewFile();
                  }}
                  className="px-2 pb-2"
                >
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    placeholder="src/utils.js"
                    aria-label="New file path"
                    autoFocus
                    className="h-8 w-full rounded-lg glass-input px-2.5 font-mono text-xs text-fg placeholder:text-subtle focus:border-[var(--accent)] focus:outline-none"
                  />
                </form>
              )}

              <div className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:overflow-y-auto">
                {files.map((file) => {
                  const active = file.path === activeFile?.path;
                  return (
                    <div
                      key={file.path}
                      className={cn(
                        "group flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-mono text-xs transition-colors",
                        active
                          ? "bg-surface-hover font-bold text-fg"
                          : "text-muted hover:bg-surface-hover/60 hover:text-fg",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setActivePath(file.path)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <FileCode weight="bold" className="size-3.5 shrink-0 text-subtle" aria-hidden />
                        <span className="truncate">{file.path}</span>
                      </button>
                      {files.length > 1 && (
                        <button
                          type="button"
                          onClick={() => deleteFile(file.path)}
                          aria-label={`Delete ${file.path}`}
                          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500 focus:opacity-100"
                        >
                          <Trash weight="bold" className="size-3" aria-hidden />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>
          )}

          {/* Code Editor Pane */}
          {layout !== "preview" && activeFile && (
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col",
                layout === "split" && "border-b border-line md:border-r md:border-b-0",
              )}
            >
              <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
                <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-fg">
                  <Code weight="bold" className="size-3.5 text-subtle" aria-hidden />
                  {activeFile.path}
                </span>
                <button
                  type="button"
                  onClick={() => void copyActiveFile()}
                  aria-label="Copy current file"
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-muted transition-colors hover:bg-surface-hover hover:text-fg"
                >
                  {copiedPath === activeFile.path ? (
                    <>
                      <Check weight="bold" className="size-3.5 text-emerald-500" aria-hidden />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy weight="bold" className="size-3.5" aria-hidden />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <textarea
                aria-label={`Edit ${activeFile.path}`}
                value={activeFile.content}
                onChange={(e) => updateActiveContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const el = e.currentTarget;
                    const start = el.selectionStart;
                    const end = el.selectionEnd;
                    const next = `${activeFile.content.slice(0, start)}  ${activeFile.content.slice(end)}`;
                    updateActiveContent(next);
                    window.requestAnimationFrame(() => {
                      el.selectionStart = el.selectionEnd = start + 2;
                    });
                  }
                }}
                spellCheck={false}
                className="min-h-48 flex-1 resize-none bg-transparent p-3.5 font-mono text-xs leading-relaxed text-fg focus:outline-none sm:text-[13px]"
              />
            </div>
          )}

          {/* Sandboxed Live Preview + Console Pane */}
          {layout !== "code" && (
            <div className="flex min-h-0 flex-1 flex-col bg-black/20">
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 sm:p-3">
                <iframe
                  key={runId}
                  title="Proxima Sandbox Preview"
                  sandbox="allow-scripts"
                  srcDoc={srcDoc}
                  className={cn(
                    "h-full rounded-2xl border border-line bg-[#0b0d12] shadow-lg transition-[width] duration-300",
                    viewport === "desktop" && "w-full",
                    viewport === "tablet" && "w-[min(100%,768px)]",
                    viewport === "mobile" && "w-[min(100%,390px)]",
                  )}
                />
              </div>

              {/* Console Output Drawer */}
              <div className="shrink-0 border-t border-line">
                <div className="flex items-center justify-between px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => setConsoleOpen((v) => !v)}
                    className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] text-muted uppercase hover:text-fg"
                  >
                    <span>Console</span>
                    <span className="rounded-full bg-surface-hover px-1.5 py-0.5 font-mono text-[10px] text-fg">
                      {logs.length}
                    </span>
                    {errorCount > 0 && (
                      <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 font-mono text-[10px] text-red-400">
                        {errorCount} err
                      </span>
                    )}
                  </button>
                  {logs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setLogs([])}
                      className="text-[11px] font-bold text-subtle hover:text-fg"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {consoleOpen && (
                  <div className="max-h-32 overflow-y-auto px-3 pb-2.5 font-mono text-xs">
                    {logs.length === 0 ? (
                      <p className="text-subtle">No console output yet.</p>
                    ) : (
                      <ul className="space-y-1">
                        {logs.map((entry) => (
                          <li
                            key={entry.id}
                            className={cn(
                              "rounded-lg px-2 py-1 break-words whitespace-pre-wrap",
                              entry.level === "error"
                                ? "bg-red-500/15 text-red-400"
                                : entry.level === "warn"
                                  ? "bg-amber-500/15 text-amber-300"
                                  : "bg-surface-hover/50 text-fg",
                            )}
                          >
                            {entry.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
