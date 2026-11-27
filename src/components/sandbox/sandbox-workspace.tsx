"use client";

import {
  ArrowClockwise,
  ArrowLeft,
  Check,
  Code,
  Columns,
  Copy,
  Desktop,
  DeviceMobile,
  DeviceTablet,
  DownloadSimple,
  Eye,
  FileCode,
  FolderOpen,
  Play,
  Plus,
  SidebarSimple,
  TerminalWindow,
  Trash,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSandboxDocument,
  sanitizeFilePath,
  STARTER_SANDBOX_FILES,
  type GeneratedFile,
} from "@/lib/chat/client/code-bundle";
import { cn } from "@/lib/cn";
import { browserSandboxedJsEvaluator } from "@/lib/sandbox/browser-js-runner";
import {
  createCommandPromptState,
  executeCommandLine,
  formatPromptCwd,
  type CommandPromptState,
} from "@/lib/sandbox/command-prompt";
import { loadSandboxProject, saveSandboxProject } from "@/lib/sandbox/storage";

type DesktopLayout = "split" | "preview" | "code";
type MobileTab = "preview" | "code" | "terminal" | "files";
type ViewportMode = "full" | "tablet" | "mobile";
type BottomTab = "terminal" | "console";

type ConsoleEntry = {
  id: number;
  level: "log" | "info" | "warn" | "error";
  text: string;
  time: string;
};

type TerminalEntry = {
  id: number;
  kind: "cmd" | "stdout" | "stderr" | "system";
  prompt?: string;
  text: string;
};

function inferLanguage(path: string): string {
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
  };
  return map[ext] ?? ext;
}

const QUICK_COMMANDS = ["ls -la", "tree", "node -e \"console.log('Proxima ready!')\"", "help", "clear"] as const;

export function SandboxWorkspace() {
  const initialProject = useMemo(() => loadSandboxProject(), []);
  const [projectName] = useState(initialProject.projectName);
  const [files, setFiles] = useState<GeneratedFile[]>(initialProject.files);
  const [activePath, setActivePath] = useState<string>(
    initialProject.files[0]?.path ?? STARTER_SANDBOX_FILES[0]!.path,
  );

  // Desktop & mobile layout states
  const [desktopLayout, setDesktopLayout] = useState<DesktopLayout>("split");
  const [mobileTab, setMobileTab] = useState<MobileTab>("preview");
  const [viewport, setViewport] = useState<ViewportMode>("full");
  const [showFilesSidebar, setShowFilesSidebar] = useState(true);
  const [desktopDrawerOpen, setDesktopDrawerOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState<BottomTab>("terminal");

  // File creation state (no browser window.prompt popups!)
  const [addingFile, setAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileError, setNewFileError] = useState<string | null>(null);

  // Preview compile & run state
  const [compiledFiles, setCompiledFiles] = useState<GeneratedFile[]>(initialProject.files);
  const [runCounter, setRunCounter] = useState(1);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState(false);

  // Command Prompt state
  const [promptState, setPromptState] = useState<CommandPromptState>(() =>
    createCommandPromptState(initialProject.files),
  );
  const [cmdInput, setCmdInput] = useState("");
  const [cmdRunning, setCmdRunning] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<number>(-1);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([
    {
      id: 1,
      kind: "system",
      text: "Proxima Command Prompt ready — synced live with your workspace files. Type 'help' to see commands.",
    },
  ]);

  const entrySeq = useRef(2);
  const logSeq = useRef(1);
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const cmdInputRef = useRef<HTMLInputElement>(null);

  // Persist edits back to storage
  useEffect(() => {
    saveSandboxProject({ projectName, files });
  }, [files, projectName]);

  // Debounced live preview compile — updates srcDoc smoothly without jarring iframe remounts
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCompiledFiles(files);
    }, 380);
    return () => window.clearTimeout(timer);
  }, [files]);

  const runId = `sandbox-run-${runCounter}`;

  // Stream iframe console.* & runtime errors cleanly
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        __proximaSandbox?: boolean;
        runId?: string;
        level?: ConsoleEntry["level"];
        text?: string;
      } | null;
      if (!data || !data.__proximaSandbox || data.runId !== runId) return;
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
      setConsoleLogs((prev) => [
        ...prev.slice(-150),
        {
          id: logSeq.current++,
          level: data.level ?? "log",
          text: String(data.text ?? ""),
          time,
        },
      ]);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [runId]);

  // Keep terminal scrolled to latest output
  useEffect(() => {
    const el = terminalScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [terminalEntries, consoleLogs, bottomTab, mobileTab, desktopDrawerOpen]);

  const visibleFiles = useMemo(() => files.filter((f) => !f.path.endsWith(".gitkeep")), [files]);

  const activeFile = useMemo(
    () => visibleFiles.find((f) => f.path === activePath) ?? visibleFiles[0] ?? null,
    [visibleFiles, activePath],
  );

  const srcDoc = useMemo(() => buildSandboxDocument(compiledFiles, runId), [compiledFiles, runId]);

  const errorCount = useMemo(
    () => consoleLogs.filter((l) => l.level === "error").length,
    [consoleLogs],
  );

  const triggerManualRun = useCallback(() => {
    setConsoleLogs([]);
    setCompiledFiles(files);
    setRunCounter((c) => c + 1);
  }, [files]);

  const handleDownloadZip = useCallback(async () => {
    if (zipping) return;
    setZipping(true);
    try {
      const { downloadFilesAsZip } = await import("@/lib/chat/client/zip");
      const safeSlug = projectName.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-|-$/g, "") || "proxima-project";
      downloadFilesAsZip(
        visibleFiles.map((f) => ({ path: f.path, content: f.content })),
        `${safeSlug}.zip`,
      );
    } finally {
      setZipping(false);
    }
  }, [visibleFiles, projectName, zipping]);

  const updateActiveContent = useCallback(
    (nextContent: string) => {
      if (!activeFile) return;
      setFiles((prev) =>
        prev.map((f) => (f.path === activeFile.path ? { ...f, content: nextContent } : f)),
      );
    },
    [activeFile],
  );

  const handleCreateFile = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const safe = sanitizeFilePath(newFileName.trim());
      if (!safe) {
        setNewFileError("Enter a valid path like src/utils.js");
        return;
      }
      if (files.some((f) => f.path === safe)) {
        setActivePath(safe);
        setAddingFile(false);
        setNewFileName("");
        setNewFileError(null);
        return;
      }
      const next: GeneratedFile = { path: safe, language: inferLanguage(safe), content: "" };
      setFiles((prev) => [...prev, next]);
      setActivePath(safe);
      setAddingFile(false);
      setNewFileName("");
      setNewFileError(null);
    },
    [files, newFileName],
  );

  const handleDeleteFile = useCallback(
    (path: string) => {
      if (visibleFiles.length <= 1) return;
      setFiles((prev) => {
        const remaining = prev.filter((f) => f.path !== path);
        if (activePath === path) {
          const nextVisible = remaining.find((f) => !f.path.endsWith(".gitkeep"));
          setActivePath(nextVisible?.path ?? "");
        }
        return remaining;
      });
    },
    [activePath, visibleFiles.length],
  );

  const copyActiveCode = useCallback(async () => {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }, [activeFile]);

  const runTerminalCommand = useCallback(
    async (rawCommand: string) => {
      const command = rawCommand.trim();
      if (!command || cmdRunning) return;

      const promptLabel = `proxima@sandbox:${formatPromptCwd(promptState.cwd)}$`;
      setCmdInput("");
      setHistoryCursor(-1);
      setCmdRunning(true);

      setTerminalEntries((prev) => [
        ...prev.slice(-240),
        { id: entrySeq.current++, kind: "cmd", prompt: promptLabel, text: command },
      ]);

      try {
        const latestState: CommandPromptState = {
          ...promptState,
          files: files.map((f) => ({ ...f })),
        };
        const result = await executeCommandLine(command, latestState, browserSandboxedJsEvaluator);
        setPromptState(result.state);

        if (result.filesChanged) {
          setFiles(result.state.files);
          if (!result.state.files.some((f) => f.path === activePath)) {
            const firstVisible = result.state.files.find((f) => !f.path.endsWith(".gitkeep"));
            if (firstVisible) setActivePath(firstVisible.path);
          }
        }

        if (result.clearScreen) {
          setTerminalEntries([]);
        } else {
          const added: TerminalEntry[] = [];
          if (result.stdout) {
            added.push({ id: entrySeq.current++, kind: "stdout", text: result.stdout });
          }
          if (result.stderr) {
            added.push({ id: entrySeq.current++, kind: "stderr", text: result.stderr });
          }
          if (added.length > 0) {
            setTerminalEntries((prev) => [...prev.slice(-240), ...added]);
          }
        }

        if (result.triggerRunPreview) {
          setConsoleLogs([]);
          setCompiledFiles(result.state.files);
          setRunCounter((c) => c + 1);
        }
        if (result.triggerDownloadZip) {
          void handleDownloadZip();
        }
      } finally {
        setCmdRunning(false);
        window.requestAnimationFrame(() => cmdInputRef.current?.focus());
      }
    },
    [activePath, cmdRunning, files, handleDownloadZip, promptState],
  );

  const handleTerminalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void runTerminalCommand(cmdInput);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (promptState.history.length === 0) return;
      const nextIdx = historyCursor < 0 ? promptState.history.length - 1 : Math.max(0, historyCursor - 1);
      setHistoryCursor(nextIdx);
      setCmdInput(promptState.history[nextIdx] ?? "");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyCursor < 0) return;
      const nextIdx = historyCursor + 1;
      if (nextIdx >= promptState.history.length) {
        setHistoryCursor(-1);
        setCmdInput("");
      } else {
        setHistoryCursor(nextIdx);
        setCmdInput(promptState.history[nextIdx] ?? "");
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const parts = cmdInput.split(/\s+/);
      const last = parts[parts.length - 1] ?? "";
      if (!last) return;
      const match = visibleFiles.find((f) => f.path.toLowerCase().startsWith(last.toLowerCase()));
      if (match) {
        parts[parts.length - 1] = match.path;
        setCmdInput(parts.join(" "));
      }
    }
  };

  // Shared File Explorer panel (used in Desktop Sidebar & Mobile Files Tab)
  const renderFileExplorer = (mobileMode: boolean) => (
    <div className="flex h-full min-h-0 flex-col bg-surface-solid/95">
      <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-widest text-subtle uppercase">
          <FolderOpen weight="bold" className="size-3.5" aria-hidden />
          Files ({visibleFiles.length})
        </span>
        <button
          type="button"
          onClick={() => {
            setAddingFile((v) => !v);
            setNewFileError(null);
          }}
          aria-label="New file"
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2 text-xs font-bold text-fg transition-colors hover:bg-surface-hover"
        >
          <Plus weight="bold" className="size-3.5" aria-hidden />
          <span>New</span>
        </button>
      </div>

      {addingFile && (
        <form onSubmit={handleCreateFile} className="shrink-0 border-b border-line bg-surface-hover/50 p-2.5">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => {
                setNewFileName(e.target.value);
                setNewFileError(null);
              }}
              placeholder="e.g. src/app.js"
              autoFocus
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 font-mono text-xs text-fg outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="h-9 shrink-0 rounded-lg bg-inverse px-2.5 text-xs font-extrabold text-on-inverse"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingFile(false);
                setNewFileError(null);
              }}
              aria-label="Cancel new file"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-muted hover:text-fg"
            >
              <X weight="bold" className="size-3.5" aria-hidden />
            </button>
          </div>
          {newFileError && <p className="mt-1.5 text-[11px] font-semibold text-danger">{newFileError}</p>}
        </form>
      )}

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {visibleFiles.map((file) => {
          const active = file.path === activeFile?.path;
          return (
            <div
              key={file.path}
              className={cn(
                "group flex items-center justify-between gap-1 rounded-xl px-2.5 transition-colors",
                mobileMode ? "min-h-11" : "py-1.5",
                active ? "bg-surface-hover text-fg ring-1 ring-line" : "text-muted hover:bg-surface-hover/60 hover:text-fg",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setActivePath(file.path);
                  if (mobileMode) setMobileTab("code");
                }}
                className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
              >
                <FileCode weight={active ? "fill" : "regular"} className="size-4 shrink-0 text-[var(--accent-text)]" aria-hidden />
                <span className="truncate font-mono text-xs font-semibold">{file.path}</span>
              </button>
              {visibleFiles.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleDeleteFile(file.path)}
                  aria-label={`Delete ${file.path}`}
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-subtle transition hover:bg-danger/15 hover:text-danger",
                    mobileMode ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
                  )}
                >
                  <Trash weight="bold" className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // Shared Code Editor panel
  const renderCodeEditor = (mobileMode: boolean) => (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-bg">
      {/* File pills strip (always handy on mobile, also quick switcher on desktop) */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-solid/80 px-2.5 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
          {visibleFiles.map((file) => {
            const selected = file.path === activeFile?.path;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setActivePath(file.path)}
                className={cn(
                  "shrink-0 rounded-lg px-2.5 py-1.5 font-mono text-xs font-semibold transition-colors",
                  selected ? "bg-surface-hover text-fg ring-1 ring-line" : "text-subtle hover:text-fg",
                )}
              >
                {file.path}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => void copyActiveCode()}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 text-[11px] font-bold text-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          {copied ? <Check weight="bold" className="size-3.5 text-emerald-500" /> : <Copy weight="bold" className="size-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      <textarea
        value={activeFile?.content ?? ""}
        onChange={(e) => updateActiveContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const el = e.currentTarget;
            const start = el.selectionStart;
            const end = el.selectionEnd;
            const val = el.value;
            updateActiveContent(`${val.slice(0, start)}  ${val.slice(end)}`);
            window.requestAnimationFrame(() => {
              el.selectionStart = el.selectionEnd = start + 2;
            });
          }
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label={activeFile ? `Edit ${activeFile.path}` : "Code editor"}
        className={cn(
          "min-h-0 w-full flex-1 resize-none bg-transparent p-3.5 font-mono [font-weight:580] tracking-[-0.012em] leading-relaxed text-fg outline-none selection:bg-accent/25",
          mobileMode ? "text-[13px]" : "text-[13px] sm:p-4",
        )}
      />
    </div>
  );

  // Shared Preview panel — full-bleed edge-to-edge by default, zero tiny box glitches!
  const renderPreview = (mobileMode: boolean) => {
    const isFramed = !mobileMode && viewport !== "full";
    const frameWidth = viewport === "mobile" ? "w-[390px]" : "w-[768px]";

    return (
      <div
        className={cn(
          "relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          isFramed ? "items-center justify-center bg-surface-hover/50 p-4" : "bg-white",
        )}
      >
        <div
          className={cn(
            "relative flex min-h-0 flex-col overflow-hidden bg-white transition-[width] duration-200",
            isFramed
              ? cn(frameWidth, "h-full max-w-full rounded-2xl border border-line shadow-2xl")
              : "h-full w-full",
          )}
        >
          <iframe
            key={runCounter}
            title="Proxima Live Sandbox Preview"
            sandbox="allow-scripts allow-forms allow-modals"
            srcDoc={srcDoc}
            className="block h-full w-full flex-1 border-0 bg-white"
          />
        </div>
      </div>
    );
  };

  // Shared Command Prompt + Console Panel
  const renderTerminalAndConsole = (mobileMode: boolean) => (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[#0c0e14] text-slate-100">
      {/* Sub-header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#12151f] px-3 py-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setBottomTab("terminal")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-extrabold transition-colors",
              bottomTab === "terminal" ? "bg-white/12 text-white" : "text-slate-400 hover:text-white",
            )}
          >
            <TerminalWindow weight="bold" className="size-3.5 text-emerald-400" aria-hidden />
            <span>Command Prompt</span>
          </button>
          <button
            type="button"
            onClick={() => setBottomTab("console")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-extrabold transition-colors",
              bottomTab === "console" ? "bg-white/12 text-white" : "text-slate-400 hover:text-white",
            )}
          >
            <span>Console</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-black",
                errorCount > 0 ? "bg-rose-500/25 text-rose-300" : "bg-white/10 text-slate-300",
              )}
            >
              {consoleLogs.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {bottomTab === "terminal" ? (
            <button
              type="button"
              onClick={() => setTerminalEntries([])}
              className="rounded-md px-2 py-1 text-[11px] font-bold text-slate-400 hover:bg-white/10 hover:text-white"
            >
              Clear
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConsoleLogs([])}
              className="rounded-md px-2 py-1 text-[11px] font-bold text-slate-400 hover:bg-white/10 hover:text-white"
            >
              Clear
            </button>
          )}
          {!mobileMode && (
            <button
              type="button"
              onClick={() => setDesktopDrawerOpen(false)}
              aria-label="Hide command prompt"
              className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X weight="bold" className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {bottomTab === "terminal" ? (
        <>
          {/* Scrollable command output */}
          <div
            ref={terminalScrollRef}
            onClick={() => cmdInputRef.current?.focus()}
            className="min-h-0 flex-1 cursor-text space-y-1.5 overflow-y-auto px-3.5 py-2.5 font-mono text-xs leading-relaxed"
          >
            {terminalEntries.map((entry) => {
              if (entry.kind === "cmd") {
                return (
                  <div key={entry.id} className="flex flex-wrap gap-x-2 break-all">
                    <span className="font-bold text-emerald-400">{entry.prompt}</span>
                    <span className="text-white">{entry.text}</span>
                  </div>
                );
              }
              if (entry.kind === "stderr") {
                return (
                  <pre key={entry.id} className="whitespace-pre-wrap break-words text-rose-400">
                    {entry.text}
                  </pre>
                );
              }
              if (entry.kind === "system") {
                return (
                  <p key={entry.id} className="text-slate-400">
                    {entry.text}
                  </p>
                );
              }
              return (
                <pre key={entry.id} className="whitespace-pre-wrap break-words text-slate-200">
                  {entry.text}
                </pre>
              );
            })}
          </div>

          {/* Quick command chips on mobile (and handy shortcut strip) */}
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-white/5 bg-[#10131c] px-3 py-1.5 no-scrollbar">
            {QUICK_COMMANDS.map((quick) => (
              <button
                key={quick}
                type="button"
                onClick={() => void runTerminalCommand(quick)}
                className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] font-semibold text-slate-300 transition hover:bg-white/12 hover:text-white"
              >
                {quick}
              </button>
            ))}
          </div>

          {/* Interactive prompt input */}
          <div className="flex shrink-0 items-center gap-2 border-t border-white/10 bg-[#0a0c11] px-3.5 py-2 font-mono text-xs">
            <span className="shrink-0 font-bold text-emerald-400">
              {mobileMode ? "$" : `proxima@sandbox:${formatPromptCwd(promptState.cwd)}$`}
            </span>
            <input
              ref={cmdInputRef}
              type="text"
              value={cmdInput}
              onChange={(e) => setCmdInput(e.target.value)}
              onKeyDown={handleTerminalKeyDown}
              disabled={cmdRunning}
              placeholder="Type a command (ls, cat, node app.js, help)…"
              aria-label="Proxima command prompt input"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-white placeholder:text-slate-500 outline-none"
            />
            <button
              type="button"
              onClick={() => void runTerminalCommand(cmdInput)}
              disabled={cmdRunning || !cmdInput.trim()}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-emerald-500/20 px-2.5 text-[11px] font-extrabold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-40"
            >
              Run
            </button>
          </div>
        </>
      ) : (
        <div
          ref={terminalScrollRef}
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3.5 py-2.5 font-mono text-xs"
        >
          {consoleLogs.length === 0 ? (
            <p className="text-slate-400">No console output yet. Logs and errors from the live preview appear here.</p>
          ) : (
            consoleLogs.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "flex items-start gap-2.5 rounded-md px-2 py-1",
                  entry.level === "error"
                    ? "bg-rose-500/15 text-rose-300"
                    : entry.level === "warn"
                      ? "bg-amber-500/15 text-amber-200"
                      : "text-slate-200",
                )}
              >
                <span className="shrink-0 text-[10px] text-slate-500">{entry.time}</span>
                <span className="min-w-0 whitespace-pre-wrap break-words">{entry.text}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-bg text-fg pt-safe">
      {/* TOP BAR */}
      <header className="flex h-13 shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-solid/95 px-2.5 sm:px-4">
        {/* Left: Back + Project Name + Desktop Sidebar Toggle */}
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/app"
            aria-label="Back to Proxima Chat"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-2.5 text-xs font-extrabold text-fg transition-colors hover:bg-surface-hover"
          >
            <ArrowLeft weight="bold" className="size-4" aria-hidden />
            <span className="hidden sm:inline">Chat</span>
          </Link>

          <button
            type="button"
            onClick={() => setShowFilesSidebar((v) => !v)}
            aria-label="Toggle file explorer"
            title="Toggle file explorer"
            className={cn(
              "hidden h-9 w-9 items-center justify-center rounded-xl border border-line transition-colors lg:inline-flex",
              showFilesSidebar ? "bg-surface-hover text-fg" : "text-muted hover:text-fg",
            )}
          >
            <SidebarSimple weight="bold" className="size-4" aria-hidden />
          </button>

          <div className="min-w-0 pl-0.5">
            <p className="truncate text-xs font-extrabold tracking-tight text-fg sm:text-sm">
              {projectName}
            </p>
            <p className="hidden text-[11px] font-medium text-subtle sm:block">
              Proxima Sandbox · {visibleFiles.length} {visibleFiles.length === 1 ? "file" : "files"}
            </p>
          </div>
        </div>

        {/* Center: Desktop Layout Mode Switcher */}
        <div className="hidden items-center gap-1 rounded-xl border border-line bg-bg p-1 lg:flex">
          {(
            [
              { id: "split", label: "Split", Icon: Columns },
              { id: "preview", label: "Preview", Icon: Eye },
              { id: "code", label: "Code", Icon: Code },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setDesktopLayout(id)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs font-extrabold transition-colors",
                desktopLayout === id ? "bg-inverse text-on-inverse" : "text-muted hover:text-fg",
              )}
            >
              <Icon weight="bold" className="size-3.5" aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Right: Viewport Frame (Desktop), Terminal Toggle (Desktop), Run, Download .zip */}
        <div className="flex shrink-0 items-center gap-1.5">
          {desktopLayout !== "code" && (
            <div className="hidden items-center gap-0.5 rounded-xl border border-line bg-bg p-1 xl:flex">
              {(
                [
                  { id: "full", label: "Full width", Icon: Desktop },
                  { id: "tablet", label: "Tablet frame", Icon: DeviceTablet },
                  { id: "mobile", label: "Mobile frame", Icon: DeviceMobile },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewport(id)}
                  aria-label={label}
                  title={label}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-lg transition-colors",
                    viewport === id ? "bg-surface-hover text-fg" : "text-subtle hover:text-fg",
                  )}
                >
                  <Icon weight="bold" className="size-3.5" aria-hidden />
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setDesktopDrawerOpen((v) => !v)}
            className={cn(
              "hidden h-9 items-center gap-1.5 rounded-xl border border-line px-2.5 text-xs font-extrabold transition-colors lg:inline-flex",
              desktopDrawerOpen ? "bg-surface-hover text-fg" : "text-muted hover:text-fg",
            )}
          >
            <TerminalWindow weight="bold" className="size-4 text-emerald-500" aria-hidden />
            <span>Prompt</span>
            {errorCount > 0 && (
              <span className="rounded-full bg-rose-500/20 px-1.5 text-[10px] font-black text-rose-500">
                {errorCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={triggerManualRun}
            aria-label="Run preview"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-2.5 text-xs font-extrabold text-fg transition-colors hover:bg-surface-hover sm:px-3"
          >
            <ArrowClockwise weight="bold" className="size-4" aria-hidden />
            <span className="hidden sm:inline">Run</span>
          </button>

          <button
            type="button"
            onClick={() => void handleDownloadZip()}
            disabled={zipping}
            aria-label="Download project as zip"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-inverse px-3 text-xs font-extrabold text-on-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <DownloadSimple weight="bold" className="size-4" aria-hidden />
            <span>{zipping ? "Zipping…" : ".zip"}</span>
          </button>
        </div>
      </header>

      {/* DESKTOP WORKSPACE (lg+) */}
      <div className="hidden min-h-0 flex-1 overflow-hidden lg:flex">
        {showFilesSidebar && (
          <aside className="w-56 shrink-0 overflow-hidden border-r border-line">
            {renderFileExplorer(false)}
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {desktopLayout !== "preview" && (
              <section
                aria-label="Code editor"
                className={cn(
                  "flex min-h-0 min-w-0 flex-col overflow-hidden",
                  desktopLayout === "split" ? "w-[42%] shrink-0 border-r border-line" : "flex-1",
                )}
              >
                {renderCodeEditor(false)}
              </section>
            )}

            {desktopLayout !== "code" && (
              <section
                aria-label="Live preview"
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              >
                {renderPreview(false)}
              </section>
            )}
          </div>

          {desktopDrawerOpen && (
            <section
              aria-label="Command prompt and console"
              className="h-56 shrink-0 overflow-hidden border-t border-line"
            >
              {renderTerminalAndConsole(false)}
            </section>
          )}
        </div>
      </div>

      {/* MOBILE / TABLET WORKSPACE (< lg): Dedicated Full-Screen Tabs — Zero Squished Panes */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          {mobileTab === "preview" && renderPreview(true)}
          {mobileTab === "code" && renderCodeEditor(true)}
          {mobileTab === "terminal" && renderTerminalAndConsole(true)}
          {mobileTab === "files" && renderFileExplorer(true)}
        </div>

        <nav
          aria-label="Sandbox views"
          className="grid shrink-0 grid-cols-4 border-t border-line bg-surface-solid pb-safe"
        >
          {(
            [
              { id: "preview", label: "Preview", Icon: Play },
              { id: "code", label: "Code", Icon: Code },
              { id: "terminal", label: "Prompt", Icon: TerminalWindow },
              { id: "files", label: "Files", Icon: FolderOpen },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = mobileTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMobileTab(id)}
                className={cn(
                  "relative flex min-h-[54px] flex-col items-center justify-center gap-0.5 text-[11px] font-extrabold transition-colors",
                  active ? "text-fg" : "text-subtle",
                )}
              >
                {active && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-fg" aria-hidden />}
                <Icon weight={active ? "fill" : "bold"} className="size-4.5" aria-hidden />
                <span>{label}</span>
                {id === "terminal" && errorCount > 0 && (
                  <span className="absolute top-1.5 right-4 size-2 rounded-full bg-rose-500" aria-hidden />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
