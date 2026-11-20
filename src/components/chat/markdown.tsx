"use client";

import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toBlocks } from "@/lib/chat/client/markdown-blocks";
import { CodeBlock } from "./code-block";

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
      return <CodeBlock code={textOf(codeNode).replace(/\n$/, "")} language={language} live={live} />;
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
        <div className="my-4 overflow-x-auto rounded-xl border border-line">
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
    <div className={streaming ? "markdown is-streaming" : "markdown"}>
      {blocks.map((block, i) => (
        <MarkdownBlock key={i} text={block} live={streaming && i === blocks.length - 1} />
      ))}
    </div>
  );
}

export default Markdown;
