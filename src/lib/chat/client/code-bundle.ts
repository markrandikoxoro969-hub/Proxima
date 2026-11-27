/**
 * Extracts generated code files from Proxima Markdown replies and compiles
 * multi-file web/JS/SVG snippets into a self-contained sandboxed HTML document.
 */

export type GeneratedFile = {
  path: string;
  language: string;
  content: string;
};

const EXT_BY_LANG: Record<string, string> = {
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  js: "js",
  javascript: "js",
  mjs: "mjs",
  jsx: "jsx",
  ts: "ts",
  typescript: "ts",
  tsx: "tsx",
  json: "json",
  py: "py",
  python: "py",
  svg: "svg",
  md: "md",
  markdown: "md",
  sh: "sh",
  bash: "sh",
  sql: "sql",
  yaml: "yaml",
  yml: "yml",
  go: "go",
  rs: "rs",
  rust: "rs",
  java: "java",
  xml: "xml",
  txt: "txt",
};

const DEFAULT_BASENAME_BY_EXT: Record<string, string> = {
  html: "index.html",
  css: "styles.css",
  js: "script.js",
  mjs: "script.mjs",
  ts: "index.ts",
  jsx: "App.jsx",
  tsx: "App.tsx",
  py: "main.py",
  json: "data.json",
  svg: "graphic.svg",
  md: "README.md",
  sh: "run.sh",
  sql: "schema.sql",
};

/** Sanitizes a relative file path so it is safe for both virtual FS and ZIP archives. */
export function sanitizeFilePath(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^`+|`+$/g, "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");

  if (!cleaned) return null;
  const segments = cleaned.split("/").filter(Boolean);
  if (!segments.length) return null;
  if (segments.some((seg) => seg === "." || seg === ".." || /[\u0000-\u001f]/.test(seg))) {
    return null;
  }
  return segments.join("/");
}

function guessPathFromContext(
  precedingText: string,
  language: string,
  content: string,
  usedPaths: Set<string>,
): string | null {
  // 1. Check Proxima's canonical multi-file heading: ### `path/to/file.ext` or ## path/to/file.ext
  const tailLines = precedingText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3);

  for (let i = tailLines.length - 1; i >= 0; i--) {
    const line = tailLines[i]!;
    const headingMatch =
      line.match(/^#{1,6}\s+(?:\d+[.)]\s+)?`?([\w./@-]+\.[a-z0-9]{1,8})`?\s*:?\s*$/i) ??
      line.match(/^\*\*(?:\d+[.)]\s+)?`?([\w./@-]+\.[a-z0-9]{1,8})`?\*\*:?\s*$/i) ??
      line.match(/^(?:file|filename|path)\s*:\s*`?([\w./@-]+\.[a-z0-9]{1,8})`?\s*$/i) ??
      line.match(/^`([\w./@-]+\.[a-z0-9]{1,8})`\s*:?\s*$/i);
    if (headingMatch?.[1]) {
      const safe = sanitizeFilePath(headingMatch[1]);
      if (safe) return safe;
    }
  }

  // 2. Check first-line filename comment inside the code block itself (e.g. `// src/app.js` or `<!-- index.html -->`)
  const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const commentMatch =
    firstLine.match(/^(?:\/\/|#|--)\s*(?:file(?:name)?:\s*)?([\w./@-]+\.[a-z0-9]{1,8})\s*$/i) ??
    firstLine.match(/^\/\*\s*(?:file(?:name)?:\s*)?([\w./@-]+\.[a-z0-9]{1,8})\s*\*\/$/i) ??
    firstLine.match(/^<!--\s*(?:file(?:name)?:\s*)?([\w./@-]+\.[a-z0-9]{1,8})\s*-->$/i);
  if (commentMatch?.[1]) {
    const safe = sanitizeFilePath(commentMatch[1]);
    if (safe) return safe;
  }

  // 3. Fallback filename based on language (skip pure ASCII directory trees like `text` containing ├── / └──)
  const lang = language.toLowerCase();
  if ((!lang || lang === "text" || lang === "txt") && /[├└]──/.test(content)) {
    return null;
  }
  const ext = EXT_BY_LANG[lang];
  if (!ext) return null;

  const base = DEFAULT_BASENAME_BY_EXT[ext] ?? `file.${ext}`;
  if (!usedPaths.has(base)) return base;

  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const suffix = dot > 0 ? base.slice(dot) : "";
  let n = 2;
  while (usedPaths.has(`${stem}-${n}${suffix}`)) n++;
  return `${stem}-${n}${suffix}`;
}

/**
 * Extracts all code files from an assistant Markdown message.
 * Preserves multi-file project paths (`### \`src/a.ts\``) and gracefully names
 * standalone code snippets (`index.html`, `styles.css`, `script.js`, etc.).
 */
export function extractGeneratedFiles(markdown: string): GeneratedFile[] {
  if (!markdown || !markdown.includes("```")) return [];

  const files: GeneratedFile[] = [];
  const byPath = new Map<string, number>();
  const usedPaths = new Set<string>();

  // Match fenced code blocks (supports 3+ backticks).
  const fenceRegex = /(`{3,})([^\n`]*)\n([\s\S]*?)\n?\1(?=\s|$)/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(markdown)) !== null) {
    const rawInfo = (match[2] ?? "").trim();
    const content = match[3] ?? "";
    const preceding = markdown.slice(lastEnd, match.index);
    lastEnd = fenceRegex.lastIndex;

    if (!content.trim()) continue;

    // Support info string like `tsx src/App.tsx` or `js title="app.js"`
    const infoTokens = rawInfo.split(/\s+/).filter(Boolean);
    const language = (infoTokens[0] ?? "").toLowerCase();
    // Never treat Proxima's inline Arena-style terminal execution cards as generated code files.
    if (language === "proxima-terminal") continue;
    let explicitPath: string | null = null;
    for (const token of infoTokens.slice(1)) {
      const cleaned = token.replace(/^(?:title|file|filename)=["']?|["']$/gi, "");
      if (/^[\w./@-]+\.[a-z0-9]{1,8}$/i.test(cleaned)) {
        explicitPath = sanitizeFilePath(cleaned);
        if (explicitPath) break;
      }
    }

    const path = explicitPath ?? guessPathFromContext(preceding, language, content, usedPaths);
    if (!path) continue;

    const normalizedLang =
      language || path.slice(path.lastIndexOf(".") + 1).toLowerCase() || "text";

    const existingIndex = byPath.get(path);
    if (existingIndex !== undefined) {
      files[existingIndex] = { path, language: normalizedLang, content };
    } else {
      byPath.set(path, files.length);
      usedPaths.add(path);
      files.push({ path, language: normalizedLang, content });
    }
  }

  return files;
}

const DEFAULT_FALLBACK_BASENAMES = new Set(Object.values(DEFAULT_BASENAME_BY_EXT));

function extOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

/**
 * Merges generated code files across the conversation up through `targetIndex`.
 *
 * When a user builds a multi-file website (e.g. `index.html`, `styles.css`, `app.js`)
 * in Turn 1 and asks "edit js file" in Turn 2, Turn 2 only emits the updated JS file.
 * Merging preserves the full runnable project (`index.html` + `styles.css` + updated JS)
 * so Sandbox and Download .zip execute the entire updated website cleanly.
 *
 * Returns `[]` if the target message itself did not emit any code files.
 */
export function mergeGeneratedFilesFromHistory(
  messages: readonly { role: string; content: string }[],
  targetIndex: number,
): GeneratedFile[] {
  const target = messages[targetIndex];
  if (!target || target.role !== "assistant" || !target.content.includes("```")) return [];

  const targetFiles = extractGeneratedFiles(target.content);
  if (targetFiles.length === 0) return [];

  const merged = new Map<string, GeneratedFile>();

  const applyFiles = (incoming: readonly GeneratedFile[]) => {
    for (const file of incoming) {
      if (merged.has(file.path)) {
        merged.set(file.path, file);
        continue;
      }
      // If a follow-up edit emitted an unnamed block that fell back to a default
      // filename (e.g. `script.js` or `styles.css`) and the existing project already
      // has a single file with that same extension (e.g. `app.js`), update it in-place
      // so `<script src="app.js">` in `index.html` runs the edited code immediately.
      const base = file.path.split("/").pop() ?? file.path;
      if (DEFAULT_FALLBACK_BASENAMES.has(base)) {
        const ext = extOf(file.path);
        const sameExt = Array.from(merged.values()).filter((existing) => extOf(existing.path) === ext);
        if (sameExt.length === 1) {
          const existing = sameExt[0]!;
          merged.set(existing.path, { ...file, path: existing.path });
          continue;
        }
      }
      merged.set(file.path, file);
    }
  };

  for (let i = 0; i <= targetIndex; i += 1) {
    const msg = messages[i];
    if (!msg || msg.role !== "assistant" || !msg.content.includes("```")) continue;
    const files = i === targetIndex ? targetFiles : extractGeneratedFiles(msg.content);
    if (files.length > 0) applyFiles(files);
  }

  return Array.from(merged.values());
}

export const STARTER_SANDBOX_FILES: GeneratedFile[] = [
  {
    path: "index.html",
    language: "html",
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Proxima Sandbox</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="card">
    <span class="badge">PROXIMA SANDBOX</span>
    <h1>Live Interactive Preview</h1>
    <p>Edit HTML, CSS, or JavaScript on the left and watch changes run safely in real time.</p>
    <button id="counter-btn" type="button">Clicks: 0</button>
  </main>
  <script src="app.js"></script>
</body>
</html>`,
  },
  {
    path: "styles.css",
    language: "css",
    content: `* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, -apple-system, sans-serif;
  background: radial-gradient(circle at top, #1e1b4b, #09090b 70%);
  color: #f8fafc;
}
.card {
  width: min(90vw, 420px);
  padding: 2rem;
  border-radius: 1.5rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(16px);
  text-align: center;
}
.badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  background: rgba(167, 139, 250, 0.18);
  color: #c4b5fd;
}
h1 { margin: 1rem 0 0.5rem; font-size: 1.5rem; }
p { color: rgba(248, 250, 252, 0.72); line-height: 1.5; font-size: 0.92rem; }
button {
  margin-top: 1.25rem;
  padding: 0.7rem 1.4rem;
  border-radius: 999px;
  border: 0;
  background: #ffffff;
  color: #09090b;
  font-weight: 700;
  cursor: pointer;
}`,
  },
  {
    path: "app.js",
    language: "js",
    content: `let count = 0;
const btn = document.getElementById("counter-btn");
btn?.addEventListener("click", () => {
  count += 1;
  btn.textContent = "Clicks: " + count;
  console.log("Button clicked:", count);
});
console.log("Proxima Sandbox ready!");`,
  },
];

function escapeInlineTag(content: string, tag: "script" | "style"): string {
  return content.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
}

/** Console bridge injected into sandboxed iframe so logs/errors stream to the parent UI safely. */
function sandboxBridgeScript(runId: string): string {
  return `<script>
(function(){
  var RUN_ID = ${JSON.stringify(runId)};
  function fmt(v){
    if(v instanceof Error) return v.stack || v.message;
    if(typeof v === "string") return v;
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  }
  function send(level, args){
    try {
      parent.postMessage({
        __proximaSandbox: true,
        runId: RUN_ID,
        level: level,
        text: Array.prototype.map.call(args, fmt).join(" ")
      }, "*");
    } catch {}
  }
  ["log","info","warn","error"].forEach(function(level){
    var orig = console[level];
    console[level] = function(){
      send(level, arguments);
      if(orig) orig.apply(console, arguments);
    };
  });
  window.addEventListener("error", function(e){
    var msg = e.message + (e.lineno ? " (line " + e.lineno + ")" : "");
    send("error", [msg]);
    showErrorOverlay(msg);
  });
  window.addEventListener("unhandledrejection", function(e){
    var msg = "Unhandled promise rejection: " + fmt(e.reason);
    send("error", [msg]);
    showErrorOverlay(msg);
  });
  function showErrorOverlay(msg){
    try {
      var host = document.body || document.documentElement;
      if (!host) return;
      var box = document.getElementById("__proxima_err_bar");
      if (!box) {
        box = document.createElement("div");
        box.id = "__proxima_err_bar";
        box.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;padding:10px 14px;border-radius:12px;background:rgba(127,29,29,0.94);color:#fecaca;border:1px solid rgba(248,113,113,0.45);font:600 12px/1.45 ui-monospace,SFMono-Regular,monospace;box-shadow:0 12px 32px rgba(0,0,0,0.45);display:flex;align-items:flex-start;gap:10px;";
        var txt = document.createElement("span");
        txt.id = "__proxima_err_txt";
        txt.style.cssText = "flex:1;white-space:pre-wrap;word-break:break-word;";
        var btn = document.createElement("button");
        btn.textContent = "×";
        btn.style.cssText = "background:none;border:0;color:#fecaca;font-size:16px;line-height:1;cursor:pointer;padding:0 2px;";
        btn.onclick = function(){ box.remove(); };
        box.appendChild(txt);
        box.appendChild(btn);
        host.appendChild(box);
      }
      var el = document.getElementById("__proxima_err_txt");
      if (el) el.textContent = "Preview Error: " + msg;
    } catch {}
  }
})();
</script>`;
}

function isExternalRef(ref: string): boolean {
  return /^(?:https?:|\/\/|data:|blob:)/i.test(ref.trim());
}

function findVirtualFile(
  files: GeneratedFile[],
  ref: string,
  allowSingleFallback = false,
): GeneratedFile | undefined {
  if (isExternalRef(ref)) return undefined;
  const normalized = ref.replace(/^\.?\//, "").replace(/^\/+/, "").split(/[?#]/)[0] ?? "";
  if (!normalized) return undefined;
  const base = normalized.split("/").pop() ?? normalized;
  const exact =
    files.find((f) => f.path === normalized) ??
    files.find((f) => f.path.endsWith(`/${normalized}`)) ??
    files.find((f) => (f.path.split("/").pop() ?? f.path) === base);
  if (exact) return exact;
  if (allowSingleFallback && files.length === 1) return files[0];
  return undefined;
}

/** Strips relative local `import`/`export` statements when bundling sibling scripts into one inline page. */
function stripRelativeModuleSyntax(code: string): string {
  return code
    .replace(/^\s*import\s+[\s\S]*?\s+from\s+["']\.[^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+["']\.[^"']+["'];?\s*$/gm, "")
    .replace(/^\s*export\s+default\s+/gm, "const __ProximaDefaultExport = ")
    .replace(/^\s*export\s+(?=(?:const|let|var|function|class|async\s+function)\b)/gm, "");
}

/**
 * Compiles one or more generated files into a self-contained HTML string suitable
 * for `<iframe sandbox="allow-scripts" srcDoc={...} />`.
 */
export function buildSandboxDocument(files: GeneratedFile[], runId: string): string {
  const bridge = sandboxBridgeScript(runId);
  if (!files.length) {
    return `<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem;color:#94a3b8;background:#0b0d12;">No files to preview.</body></html>`;
  }

  const htmlFile =
    files.find((f) => /(?:^|\/)index\.html?$/i.test(f.path)) ??
    files.find((f) => /\.html?$/i.test(f.path) || f.language === "html");
  const cssFiles = files.filter((f) => /\.css$/i.test(f.path) || f.language === "css");
  const jsFiles = files.filter(
    (f) =>
      /\.(?:m?js)$/i.test(f.path) ||
      f.language === "js" ||
      f.language === "javascript" ||
      f.language === "mjs",
  );
  const reactFiles = files.filter(
    (f) => /\.(?:jsx|tsx)$/i.test(f.path) || f.language === "jsx" || f.language === "tsx",
  );
  const svgFile = files.find((f) => /\.svg$/i.test(f.path) || f.language === "svg");

  // 1. HTML (with linked CSS/JS automatically resolved & inlined from virtual files)
  if (htmlFile) {
    const inlinedCss = new Set<string>();
    const inlinedJs = new Set<string>();
    const deferredBodyScripts: string[] = [];
    let doc = htmlFile.content;

    // Inline <link rel="stylesheet" href="..."> referencing a generated CSS file
    doc = doc.replace(
      /<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi,
      (full, href: string) => {
        const isStylesheet = /\brel=["'][^"']*stylesheet/i.test(full) || /\.css(?:[?#]|$)/i.test(href);
        const match = isStylesheet ? findVirtualFile(cssFiles, href, true) : undefined;
        if (!match) return full;
        inlinedCss.add(match.path);
        return `<style data-file="${match.path}">\n${escapeInlineTag(match.content, "style")}\n</style>`;
      },
    );

    // Inline <script src="..."></script> referencing a generated JS file.
    // Note: browsers ignore `defer` on inline <script> tags, so any deferred script
    // (or script placed inside <head>) is moved right before </body> so DOM queries never fail.
    const headEndIndex = doc.search(/<\/head>/i);
    doc = doc.replace(
      /<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
      (full, src: string, offset: number) => {
        const match = findVirtualFile(jsFiles, src, true);
        if (!match) return full;
        inlinedJs.add(match.path);
        const hasLocalImport = /\b(?:import|export)\b[\s\S]*?["']\.[^"']+["']/.test(match.content);
        const isModule = !hasLocalImport && (/\btype=["']module["']/i.test(full) || match.path.endsWith(".mjs"));
        const body = hasLocalImport ? stripRelativeModuleSyntax(match.content) : match.content;
        const inlineTag = `<script${isModule ? ' type="module"' : ""} data-file="${match.path}">\n${escapeInlineTag(body, "script")}\n</script>`;
        const isDeferred = /\bdefer\b/i.test(full) || (headEndIndex >= 0 && offset < headEndIndex);
        if (isDeferred) {
          deferredBodyScripts.push(inlineTag);
          return "";
        }
        return inlineTag;
      },
    );

    // Append any unlinked CSS files into <head> and deferred/unlinked JS files before </body>
    const extraCss = cssFiles
      .filter((f) => !inlinedCss.has(f.path))
      .map((f) => `<style data-file="${f.path}">\n${escapeInlineTag(f.content, "style")}\n</style>`)
      .join("\n");
    const extraJs = [
      ...deferredBodyScripts,
      ...jsFiles
        .filter((f) => !inlinedJs.has(f.path))
        .map((f) => {
          const hasLocalImport = /\b(?:import|export)\b[\s\S]*?["']\.[^"']+["']/.test(f.content);
          const body = hasLocalImport ? stripRelativeModuleSyntax(f.content) : f.content;
          return `<script data-file="${f.path}">\n${escapeInlineTag(body, "script")}\n</script>`;
        }),
    ].join("\n");

    const viewportMeta = /<meta\b[^>]*name=["']viewport["']/i.test(doc)
      ? ""
      : '<meta name="viewport" content="width=device-width, initial-scale=1.0" />';

    if (/<head\b[^>]*>/i.test(doc)) {
      doc = doc.replace(/<head\b[^>]*>/i, (m) => `${m}\n${viewportMeta}\n${bridge}\n${extraCss}`);
    } else if (/<html\b[^>]*>/i.test(doc)) {
      doc = doc.replace(
        /<html\b[^>]*>/i,
        (m) => `${m}\n<head>\n<meta charset="UTF-8" />\n${viewportMeta}\n${bridge}\n${extraCss}\n</head>`,
      );
    } else {
      doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
${viewportMeta}
${bridge}
${extraCss}
</head>
<body>
${doc}
</body>
</html>`;
    }

    if (extraJs) {
      doc = /<\/body>/i.test(doc)
        ? doc.replace(/<\/body>/i, `${extraJs}\n</body>`)
        : `${doc}\n${extraJs}`;
    }
    return doc;
  }

  // 2. React JSX / TSX live preview (Babel standalone + React 18 UMD)
  if (reactFiles.length) {
    const styles = cssFiles
      .map((f) => `<style data-file="${f.path}">\n${escapeInlineTag(f.content, "style")}\n</style>`)
      .join("\n");
    const combinedSource = reactFiles
      .map((f) =>
        f.content
          .replace(/^\s*import\s+[\s\S]*?\s+from\s+["']react["'];?\s*$/gm, "")
          .replace(/^\s*import\s+[\s\S]*?\s+from\s+["']react-dom(?:\/client)?["'];?\s*$/gm, "")
          .replace(/^\s*import\s+[\s\S]*?\s+from\s+["']\.[^"']+["'];?\s*$/gm, "")
          .replace(/^\s*import\s+["'][^"']+\.css["'];?\s*$/gm, "")
          .replace(/^\s*export\s+default\s+function\s+(\w+)/gm, "function $1")
          .replace(/^\s*export\s+default\s+/gm, "const App = ")
          .replace(/^\s*export\s+(?=(?:const|let|var|function|class)\b)/gm, ""),
      )
      .join("\n\n");
    const entryName =
      combinedSource.match(/function\s+(App|Page|Home|Main|Root|[A-Z]\w*)\s*\(/)?.[1] ??
      combinedSource.match(/const\s+(App|Page|Home|Main|Root|[A-Z]\w*)\s*=/)?.[1] ??
      "App";

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${bridge}
<script src="https://cdn.tailwindcss.com"></script>
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
${styles}
</head>
<body style="margin:0;min-height:100vh;background:#0b0d12;color:#f8fafc;">
<div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext, Fragment } = React;
${escapeInlineTag(combinedSource, "script")}
(function(){
  const rootEl = document.getElementById("root");
  const Comp = typeof ${entryName} !== "undefined" ? ${entryName} : null;
  if (rootEl && Comp && !rootEl.hasChildNodes()) {
    ReactDOM.createRoot(rootEl).render(React.createElement(Comp));
  }
})();
</script>
</body>
</html>`;
  }

  // 3. Standalone SVG preview
  if (svgFile) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
${bridge}
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;padding:24px;}svg{max-width:100%;max-height:88vh;height:auto;}</style>
</head>
<body>${svgFile.content}</body>
</html>`;
  }

  // 3. Standalone JavaScript console runner
  if (jsFiles.length) {
    const scripts = jsFiles
      .map((f) => `<script data-file="${f.path}">\n${escapeInlineTag(f.content, "script")}\n</script>`)
      .join("\n");
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
${bridge}
<style>
body{margin:0;min-height:100vh;font-family:ui-monospace,SFMono-Regular,monospace;background:#0b0d12;color:#e2e8f0;padding:20px;font-size:13px;line-height:1.6;}
.hdr{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:12px;}
.line{padding:6px 10px;border-radius:8px;margin-bottom:6px;background:rgba(255,255,255,0.04);white-space:pre-wrap;word-break:break-word;}
.err{background:rgba(239,68,68,0.14);color:#fca5a5;}
.warn{background:rgba(245,158,11,0.14);color:#fcd34d;}
</style>
</head>
<body>
<div class="hdr">JavaScript Sandbox Output</div>
<div id="out"></div>
<script>
(function(){
  var out = document.getElementById("out");
  function append(level, text){
    var el = document.createElement("div");
    el.className = "line" + (level === "error" ? " err" : level === "warn" ? " warn" : "");
    el.textContent = text;
    out.appendChild(el);
  }
  ["log","info","warn","error"].forEach(function(level){
    var prev = console[level];
    console[level] = function(){
      var txt = Array.prototype.map.call(arguments, function(v){
        if (v instanceof Error) return v.stack || v.message;
        if (typeof v === "string") return v;
        try { return JSON.stringify(v, null, 2); } catch { return String(v); }
      }).join(" ");
      append(level, txt);
      if (prev) prev.apply(console, arguments);
    };
  });
  window.addEventListener("error", function(e){ append("error", e.message); });
})();
</script>
${scripts}
</body>
</html>`;
  }

  // 4. Non-browser languages (Python, Rust, Go, SQL, etc.) — clean preview card explaining download/copy
  const names = files.map((f) => f.path).join(", ");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
${bridge}
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#0b0d12;color:#f8fafc;padding:24px;text-align:center;} .box{max-width:420px;padding:24px;border-radius:18px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.05);} p{color:#94a3b8;font-size:14px;line-height:1.5;} code{color:#c4b5fd;}</style>
</head>
<body>
<div class="box">
  <h2 style="margin:0 0 8px;font-size:17px;">Project Files Ready</h2>
  <p>These files (<code>${names.replace(/</g, "&lt;")}</code>) aren't browser HTML/JS, so live preview isn't executed in-browser. You can edit any file here or click <strong>Download .zip</strong> to run the full project locally.</p>
</div>
</body>
</html>`;
}
