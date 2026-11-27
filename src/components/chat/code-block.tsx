"use client";

import { Check, Copy, TextAlignLeft } from "@phosphor-icons/react";
import { memo, useEffect, useState } from "react";
import { languageLabel, normalizeLanguage } from "@/lib/chat/client/code-languages";
import { cn } from "@/lib/cn";
import { useCopy } from "./use-copy";

/**
 * A phone-friendly code block with language label, Wrap toggle, and Copy button.
 *  - Auto-wraps long lines on mobile viewports (< 640px) so phone users never
 *    have to scroll sideways, with a one-tap Wrap toggle on both mobile & desktop.
 *  - Colouring loads on demand once the block finishes streaming (`live = false`)
 *    so live streaming stays 60fps smooth with zero layout stutter.
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
  // Default to wrapped on phones automatically; user can toggle anytime.
  const [wrapped, setWrapped] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false,
  );
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
    <figure className="code-block group/code my-4 overflow-hidden rounded-2xl border border-line animate-[fade-up_0.28s_var(--ease-premium)_both]">
      <figcaption className="flex items-center justify-between gap-2 border-b border-line bg-surface-hover py-1 pr-1.5 pl-3.5 sm:pl-4">
        <span className="truncate font-mono text-[11px] font-bold tracking-widest text-subtle uppercase">
          {languageLabel(language)}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setWrapped((prev) => !prev)}
            aria-pressed={wrapped}
            aria-label={wrapped ? "Disable code line wrap" : "Wrap code lines"}
            title={wrapped ? "Unwrap lines" : "Wrap lines"}
            className={cn(
              "inline-flex h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-bold transition-[color,background-color] duration-200 pointer-fine:h-8",
              wrapped
                ? "bg-surface text-fg shadow-xs"
                : "text-muted hover:bg-surface-hover hover:text-fg",
            )}
          >
            <TextAlignLeft weight="bold" className="size-3.5" aria-hidden />
            <span>{wrapped ? "Wrapped" : "Wrap"}</span>
          </button>
          <button
            type="button"
            onClick={() => copy(code)}
            aria-label={copied ? "Code copied" : "Copy code"}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-muted pointer-fine:h-8",
              "transition-[color,background-color] duration-200 hover:bg-surface-hover hover:text-fg",
            )}
          >
            {copied ? (
              <Check weight="bold" className="size-3.5 text-emerald-500" aria-hidden />
            ) : (
              <Copy weight="bold" className="size-3.5" aria-hidden />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </figcaption>
      <pre
        className={cn(
          "p-3.5 text-[12.5px] leading-relaxed sm:p-4 sm:text-[13px]",
          wrapped ? "overflow-x-hidden whitespace-pre-wrap break-words" : "overflow-x-auto whitespace-pre",
        )}
      >
        {html ? (
          <code className={`language-${language}`} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code className={language ? `language-${language}` : undefined}>{code}</code>
        )}
      </pre>
    </figure>
  );
});
