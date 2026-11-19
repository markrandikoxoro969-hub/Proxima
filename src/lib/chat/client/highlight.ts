/**
 * Code colouring with Prism. Loaded ONLY when a finished code block appears
 * (dynamic import), so it never slows down the first page load.
 *
 * Prism returns HTML; we pass it through DOMPurify and allow only <span
 * class="…"> — so even a bug in Prism could never inject scripts.
 */
import "./prism-manual";
import DOMPurify from "dompurify";
import Prism from "prismjs";
// Order matters: some languages build on others.
import "prismjs/components/prism-markup-templating";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-json";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-powershell";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-java";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-php";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-dart";
import "prismjs/components/prism-lua";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-ini";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-diff";
import "prismjs/components/prism-docker";

/** Very long code is shown plain: colouring it would freeze slow phones. */
const MAX_HIGHLIGHT_CHARS = 60_000;

export function highlight(code: string, language: string): string | null {
  const grammar = Prism.languages[language];
  if (!grammar || code.length > MAX_HIGHLIGHT_CHARS) return null;
  try {
    const html = Prism.highlight(code, grammar, language);
    return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["span"], ALLOWED_ATTR: ["class"] });
  } catch {
    return null;
  }
}
