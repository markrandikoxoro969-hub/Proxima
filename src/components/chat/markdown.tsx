"use client";

import { memo, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toBlocks } from "@/lib/chat/client/markdown-blocks";
import { cn } from "@/lib/cn";
import { CodeBlock } from "./code-block";

type TerminalCardPayload = {
  command: string;
  cwd?: string;
  exitCode?: number;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  expanded?: boolean;
};

/**
 * Arena-AI-style collapsible terminal execution card rendered natively inside
 * Markdown replies for ` ```proxima-terminal ` blocks. Persists cleanly across
 * reloads and never leaks raw XML/JSON to the user.
 */
function TerminalToolCard({ raw, live }: { raw: string; live: boolean }) {
  const [copied, setCopied] = useState(false);

  const payload = useMemo<TerminalCardPayload | null>(() => {
    try {
      const parsed = JSON.parse(raw) as TerminalCardPayload;
      if (parsed && typeof parsed.command === "string") return parsed;
      return null;
    } catch {
      return null;
    }
  }, [raw]);

  if (!payload) {
    return live ? (
      <div className="my-2.5 inline-flex max-w-full items-center gap-2 rounded-2xl glass-card px-3.5 py-2 font-mono text-xs text-muted">
        <span className="size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
        <span>Running command…</span>
      </div>
    ) : null;
  }

  const ok = (payload.exitCode ?? 0) === 0;
  const outputText = [payload.stdout, payload.stderr ? `[stderr]\n${payload.stderr}` : ""]
    .filter(Boolean)
    .join("\n\n");

  const copyOutput = () => {
    const toCopy = `$ ${payload.command}${outputText ? `\n${outputText}` : ""}`;
    void navigator.clipboard?.writeText(toCopy);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <details
      open={Boolean(payload.expanded)}
      className="group/term my-2.5 overflow-hidden rounded-2xl border border-line bg-surface-hover/75 shadow-sm backdrop-blur-md"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-2.5 text-xs select-none transition-colors hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-extrabold",
            ok ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500",
          )}
        >
          $_
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-[12px] font-bold text-fg">
          {payload.command}
        </code>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold",
            ok ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500",
          )}
        >
          {ok ? "✓" : `exit ${payload.exitCode}`}
        </span>
        {typeof payload.durationMs === "number" && (
          <span className="hidden shrink-0 font-mono text-[10px] text-subtle sm:inline">
            {payload.durationMs}ms
          </span>
        )}
        <span
          aria-hidden
          className="shrink-0 text-[10px] text-subtle transition-transform duration-200 group-open/term:rotate-180"
        >
          ▾
        </span>
      </summary>

      <div className="border-t border-line bg-bg/65 px-3.5 py-2.5 font-mono text-xs">
        <div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-subtle">
          <span className="truncate">
            proxima@sandbox:{payload.cwd || "/workspace"}
          </span>
          <button
            type="button"
            onClick={copyOutput}
            className="shrink-0 rounded-md border border-line px-2 py-0.5 font-sans text-[10px] font-bold text-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {payload.stdout ? (
          <pre
            className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed font-semibold text-fg"
            data-lenis-prevent
          >
            {payload.stdout}
          </pre>
        ) : null}
        {payload.stderr ? (
          <pre
            className={cn(
              "max-h-48 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed font-semibold text-red-400",
              payload.stdout && "mt-2 border-t border-line/60 pt-2",
            )}
            data-lenis-prevent
          >
            {payload.stderr}
          </pre>
        ) : null}
        {!payload.stdout && !payload.stderr && (
          <p className="text-[11px] text-subtle italic">
            {ok ? "(completed with no output)" : `(exited with code ${payload.exitCode})`}
          </p>
        )}
      </div>
    </details>
  );
}

/**
 * Renders AI replies as Markdown, safely:
 *  - react-markdown builds React elements (no innerHTML). Raw HTML in a reply
 *    is NOT executed, and dangerous links (javascript:) are removed.
 *  - Links open in a new tab with rel="noopener noreferrer".
 *  - Remote images aren't loaded (privacy + our CSP) — shown as links.
 *
 * Performance: the reply is split into blocks; each block is memoized, so
 * while streaming only the last block re-renders (see markdown-blocks.ts).
 */
type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function textOf(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function makeComponents(live: boolean): Components {
  return {
    pre({ node }) {
      const codeNode = (node as HastNode | undefined)?.children?.find((c) => c.tagName === "code");
      const classes = codeNode?.properties?.className;
      const className = Array.isArray(classes) ? classes.join(" ") : String(classes ?? "");
      const language = /language-([\w#+.-]+)/.exec(className)?.[1] ?? null;
      const rawText = textOf(codeNode).replace(/\n$/, "");
      if (language === "proxima-terminal") {
        return <TerminalToolCard raw={rawText} live={live} />;
      }
      return <CodeBlock code={rawText} language={language} live={live} />;
    },
    a({ href, children }) {
      const external = !!href && /^https?:\/\//i.test(href);
      return (
        <a
          href={href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
          className="font-semibold underline decoration-line-strong underline-offset-4 transition-colors duration-200 hover:decoration-fg"
        >
          {children}
        </a>
      );
    },
    img({ src, alt }) {
      if (!src || typeof src !== "string") return null;
      return (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="underline underline-offset-4"
        >
          🖼 {alt || "image"}
        </a>
      );
    },
    table({ children }) {
      return (
        // Focusable so a keyboard user can scroll a wide table sideways.
        <div
          className="my-4 overflow-x-auto rounded-xl border border-line"
          tabIndex={0}
          role="region"
          aria-label="Table — scroll sideways to see every column"
          data-lenis-prevent
        >
          <table>{children}</table>
        </div>
      );
    },
  };
}

const staticComponents = makeComponents(false);
const liveComponents = makeComponents(true);
const remarkPlugins = [remarkGfm];

const MarkdownBlock = memo(function MarkdownBlock({ text, live }: { text: string; live: boolean }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={live ? liveComponents : staticComponents}>
      {text}
    </ReactMarkdown>
  );
});

export function Markdown({ content, streaming = false }: { content: string; streaming?: boolean }) {
  const blocks = useMemo(() => toBlocks(content), [content]);
  return (
    <div className={cn("markdown message-text", streaming && "is-streaming")}>
      {blocks.map((block, i) => (
        <MarkdownBlock key={i} text={block} live={streaming && i === blocks.length - 1} />
      ))}
    </div>
  );
}

export default Markdown;
