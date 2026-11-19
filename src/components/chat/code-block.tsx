"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { memo, useEffect, useState } from "react";
import { languageLabel, normalizeLanguage } from "@/lib/chat/client/code-languages";
import { cn } from "@/lib/cn";
import { useCopy } from "./use-copy";

/**
 * A code block with language label + Copy button.
 *  - The copy button is a normal React button (the original used an inline
 *    onclick with the code pasted inside, which broke on quotes).
 *  - Colouring loads on demand and only once the block is complete
 *    (`live` = still streaming → shown plain, no re-colouring every frame).
 */
export const CodeBlock = memo(function CodeBlock({
  code,
  language: rawLanguage,
  live = false,
}: {
  code: string;
  language?: string | null;
  live?: boolean;
}) {
  const language = normalizeLanguage(rawLanguage);
  const { copied, copy } = useCopy();
  const [highlighted, setHighlighted] = useState<{ key: string; html: string } | null>(null);
  const key = `${language}:${code}`;

  useEffect(() => {
    if (live || !language) return;
    let cancelled = false;
    import("@/lib/chat/client/highlight")
      .then(({ highlight }) => {
        const html = highlight(code, language);
        if (!cancelled && html) setHighlighted({ key, html });
      })
      .catch(() => {
        /* colouring is optional — plain code still shows */
      });
    return () => {
      cancelled = true;
    };
  }, [code, language, live, key]);

  const html = !live && highlighted?.key === key ? highlighted.html : null;

  return (
    <figure className="code-block group/code my-4 overflow-hidden rounded-2xl border border-line">
      <figcaption className="flex items-center justify-between gap-2 border-b border-line bg-surface-hover py-1 pr-1 pl-4">
        <span className="font-mono text-[11px] font-bold tracking-widest text-subtle uppercase">
          {languageLabel(language)}
        </span>
        <button
          type="button"
          onClick={() => copy(code)}
          aria-label={copied ? "Code copied" : "Copy code"}
          className={cn(
            "inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-muted pointer-fine:h-9",
            "transition-[color,background-color] duration-200 hover:bg-surface-hover hover:text-fg",
          )}
        >
          {copied ? (
            <Check weight="bold" className="size-4 text-emerald-500" aria-hidden />
          ) : (
            <Copy weight="bold" className="size-4" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        {html ? (
          <code className={`language-${language}`} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code className={language ? `language-${language}` : undefined}>{code}</code>
        )}
      </pre>
    </figure>
  );
});
