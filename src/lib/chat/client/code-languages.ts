/**
 * Maps what people write after ``` (e.g. "py", "sh", "C#") to a language we
 * can colour, plus a friendly label. Unknown languages show as plain "text"
 * (the original file wrongly coloured everything unknown as JavaScript).
 * Kept separate from Prism so this tiny list loads with the page.
 */
const LANGUAGES: Record<string, string> = {
  markup: "HTML",
  css: "CSS",
  scss: "SCSS",
  javascript: "JavaScript",
  jsx: "JSX",
  typescript: "TypeScript",
  tsx: "TSX",
  json: "JSON",
  python: "Python",
  bash: "Bash",
  powershell: "PowerShell",
  sql: "SQL",
  java: "Java",
  kotlin: "Kotlin",
  swift: "Swift",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  go: "Go",
  rust: "Rust",
  php: "PHP",
  ruby: "Ruby",
  dart: "Dart",
  lua: "Lua",
  yaml: "YAML",
  toml: "TOML",
  ini: "INI",
  markdown: "Markdown",
  diff: "Diff",
  docker: "Dockerfile",
};

const ALIASES: Record<string, string> = {
  html: "markup",
  xml: "markup",
  svg: "markup",
  vue: "markup",
  svelte: "markup",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  node: "javascript",
  ts: "typescript",
  mts: "typescript",
  py: "python",
  python3: "python",
  py3: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  terminal: "bash",
  ps: "powershell",
  ps1: "powershell",
  pwsh: "powershell",
  jsonc: "json",
  json5: "json",
  yml: "yaml",
  md: "markdown",
  cs: "csharp",
  "c#": "csharp",
  "c++": "cpp",
  cc: "cpp",
  hpp: "cpp",
  h: "c",
  rb: "ruby",
  kt: "kotlin",
  kts: "kotlin",
  rs: "rust",
  golang: "go",
  dockerfile: "docker",
  patch: "diff",
  postgres: "sql",
  postgresql: "sql",
  mysql: "sql",
  sqlite: "sql",
};

/** Returns the Prism language id, or null for plain text. */
export function normalizeLanguage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (key in LANGUAGES) return key;
  return ALIASES[key] ?? null;
}

export function languageLabel(language: string | null): string {
  return language ? (LANGUAGES[language] ?? language) : "text";
}
