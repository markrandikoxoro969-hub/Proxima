/**
 * Splits Markdown into top-level blocks (paragraphs, lists, code blocks…).
 *
 * Why: while a reply streams in, only the LAST block changes. Rendering each
 * block separately (and memoizing it) means finished blocks are parsed once,
 * instead of re-parsing the whole reply on every frame like the original
 * file did. Blank lines inside ``` code fences never split a block.
 */
export function splitMarkdownBlocks(markdown: string): string[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;

  const push = () => {
    if (current.some((l) => l.trim() !== "")) blocks.push(current.join("\n"));
    current = [];
  };

  for (const line of lines) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) {
        fence = marker;
      } else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) {
        fence = null;
        current.push(line);
        push();
        continue;
      }
    }
    if (fence === null && line.trim() === "") {
      push();
      continue;
    }
    current.push(line);
  }
  push();
  return blocks;
}

/**
 * Lists that continue after a blank line ("loose" lists) must stay in one
 * block, otherwise "1. … / 2. …" would render as two lists. Merge a block
 * into the previous one when both are list items of the same kind.
 */
export function mergeListBlocks(blocks: string[]): string[] {
  const kind = (b: string) => {
    const first = b.trimStart();
    if (/^\d+[.)]\s/.test(first)) return "ol";
    // Lettered lists are common in analysed answers; they are valid Markdown
    // paragraphs, and splitting them after a blank line makes each marker sit
    // alone above its text.
    if (/^[A-Za-z][.)]\s/.test(first)) return "alpha";
    if (/^[-*+]\s/.test(first)) return "ul";
    if (/^>/.test(first)) return "quote";
    // A table split by a blank line is no longer a table; keep it whole.
    if (/^\|/.test(first)) return "table";
    return null;
  };
  const indented = (b: string) => /^(\s{2,}|\t)\S/.test(b);
  const out: string[] = [];
  for (const block of blocks) {
    const prev = out.at(-1);
    if (
      prev !== undefined &&
      ((kind(prev) && kind(prev) === kind(block)) || (kind(prev) && indented(block)))
    ) {
      out[out.length - 1] = `${prev}\n\n${block}`;
    } else {
      out.push(block);
    }
  }
  return out;
}

export const toBlocks = (markdown: string) => mergeListBlocks(splitMarkdownBlocks(markdown));

/**
 * True when the reply ends inside a fenced code block. That almost always means
 * the answer was cut off (token limit, dropped connection, Stop) — the UI can
 * then offer to continue instead of leaving the person with half a file.
 */
export function hasUnclosedCodeFence(markdown: string): boolean {
  let fence: string | null = null;
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (!marker) continue;
    if (fence === null) fence = marker;
    else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) {
      fence = null;
    }
  }
  return fence !== null;
}
