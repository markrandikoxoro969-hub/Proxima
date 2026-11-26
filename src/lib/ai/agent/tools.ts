import { z } from "zod";
import type { AgentToolContext, AgentToolDefinition, AgentToolResult } from "./types";

const MAX_DEFAULT_OUTPUT = 8_000;

/**
 * Sandboxed, Zod-validated Tool Registry.
 *
 * Security invariants:
 * 1. Every tool argument object is strictly validated against its Zod schema
 *    before execution — malformed or extra arguments are rejected cleanly.
 * 2. Destructive or approval-gated tools cannot run unless `approved: true`
 *    is explicitly passed by the caller after user confirmation.
 * 3. Tool output is bounded (`maxOutputChars`) and execution is timeout-guarded.
 * 4. No tool ever exposes arbitrary shell execution or unrestricted server FS access.
 */
export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentToolDefinition<unknown>>();

  register<TInput>(tool: AgentToolDefinition<TInput>): this {
    if (!/^[a-z][a-z0-9_]{1,47}$/.test(tool.name)) {
      throw new Error(`Invalid tool name "${tool.name}". Use lowercase snake_case.`);
    }
    this.tools.set(tool.name, tool as AgentToolDefinition<unknown>);
    return this;
  }

  get(name: string): AgentToolDefinition<unknown> | undefined {
    return this.tools.get(name);
  }

  list(): AgentToolDefinition<unknown>[] {
    return Array.from(this.tools.values());
  }

  requiresApproval(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return true;
    return tool.requiresApproval || tool.permission === "destructive";
  }

  /** Compact schema description suitable for both native tool specs and fallback system prompts. */
  describeForPrompt(): string {
    return this.list()
      .map(
        (t) =>
          `- ${t.name} [${t.permission}${t.requiresApproval ? ", requires-approval" : ""}]: ${t.description}`,
      )
      .join("\n");
  }

  async invoke(options: {
    callId: string;
    toolName: string;
    args: unknown;
    ctx: AgentToolContext;
    approved?: boolean;
    timeoutMs?: number;
    maxOutputChars?: number;
  }): Promise<AgentToolResult> {
    const started = Date.now();
    const { callId, toolName, args, ctx, approved = false } = options;
    const maxChars = options.maxOutputChars ?? MAX_DEFAULT_OUTPUT;
    const timeoutMs = options.timeoutMs ?? 25_000;

    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        callId,
        toolName,
        ok: false,
        output: "",
        error: `Unknown tool "${toolName}".`,
        durationMs: Date.now() - started,
      };
    }

    if ((tool.requiresApproval || tool.permission === "destructive") && !approved) {
      return {
        callId,
        toolName,
        ok: false,
        output: "",
        error: `Tool "${toolName}" requires explicit user approval before execution.`,
        durationMs: Date.now() - started,
      };
    }

    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) {
      return {
        callId,
        toolName,
        ok: false,
        output: "",
        error: `Invalid arguments for "${toolName}": ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        durationMs: Date.now() - started,
      };
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race<string>([
        Promise.resolve(tool.execute(parsed.data, ctx)),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms.`)), timeoutMs);
        }),
      ]);
      const bounded =
        result.length > maxChars ? `${result.slice(0, maxChars)}\n…[truncated ${result.length - maxChars} chars]` : result;
      return {
        callId,
        toolName,
        ok: true,
        output: bounded,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return {
        callId,
        toolName,
        ok: false,
        output: "",
        error: error instanceof Error ? error.message : "Tool execution failed.",
        durationMs: Date.now() - started,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/** Safe deterministic arithmetic evaluator (recursive descent, zero `eval` / `Function`). */
function safeEvaluateMath(expression: string): number {
  const tokens = expression.replace(/\s+/g, "").match(/\d+(?:\.\d+)?|[()+\-*/^]/g);
  if (!tokens || tokens.join("") !== expression.replace(/\s+/g, "")) {
    throw new Error("Only numbers and + - * / ^ ( ) operators are supported.");
  }
  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const parseExpr = (): number => {
    let left = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  };
  const parseTerm = (): number => {
    let left = parsePower();
    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const right = parsePower();
      if (op === "/" && right === 0) throw new Error("Division by zero.");
      left = op === "*" ? left * right : left / right;
    }
    return left;
  };
  const parsePower = (): number => {
    const base = parseUnary();
    if (peek() === "^") {
      consume();
      return Math.pow(base, parsePower());
    }
    return base;
  };
  const parseUnary = (): number => {
    if (peek() === "-") {
      consume();
      return -parseUnary();
    }
    if (peek() === "+") {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  };
  const parsePrimary = (): number => {
    if (peek() === "(") {
      consume();
      const value = parseExpr();
      if (consume() !== ")") throw new Error("Unmatched parenthesis.");
      return value;
    }
    const raw = consume();
    if (!raw || Number.isNaN(Number(raw))) throw new Error("Unexpected token in expression.");
    return Number(raw);
  };

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error("Unexpected trailing tokens.");
  if (!Number.isFinite(result)) throw new Error("Result is not a finite number.");
  return result;
}

/** Safe deterministic unit converter (length, mass, temperature, data, time). */
const LINEAR_UNITS: Record<string, { group: string; toBase: number }> = {
  // Length (base: meters)
  mm: { group: "length", toBase: 0.001 },
  cm: { group: "length", toBase: 0.01 },
  m: { group: "length", toBase: 1 },
  km: { group: "length", toBase: 1000 },
  in: { group: "length", toBase: 0.0254 },
  ft: { group: "length", toBase: 0.3048 },
  yd: { group: "length", toBase: 0.9144 },
  mi: { group: "length", toBase: 1609.344 },
  // Mass (base: grams)
  mg: { group: "mass", toBase: 0.001 },
  g: { group: "mass", toBase: 1 },
  kg: { group: "mass", toBase: 1000 },
  oz: { group: "mass", toBase: 28.349523125 },
  lb: { group: "mass", toBase: 453.59237 },
  // Data (base: bytes, binary 1024)
  b: { group: "data", toBase: 1 },
  kb: { group: "data", toBase: 1024 },
  mb: { group: "data", toBase: 1024 ** 2 },
  gb: { group: "data", toBase: 1024 ** 3 },
  tb: { group: "data", toBase: 1024 ** 4 },
  // Time (base: seconds)
  ms: { group: "time", toBase: 0.001 },
  s: { group: "time", toBase: 1 },
  min: { group: "time", toBase: 60 },
  hr: { group: "time", toBase: 3600 },
  day: { group: "time", toBase: 86400 },
};

function convertUnits(value: number, fromRaw: string, toRaw: string): string {
  const from = fromRaw.trim().toLowerCase();
  const to = toRaw.trim().toLowerCase();
  const tempUnits = new Set(["c", "f", "k"]);
  if (tempUnits.has(from) && tempUnits.has(to)) {
    const celsius = from === "c" ? value : from === "f" ? ((value - 32) * 5) / 9 : value - 273.15;
    const out = to === "c" ? celsius : to === "f" ? (celsius * 9) / 5 + 32 : celsius + 273.15;
    return `${Number(out.toFixed(6))} ${to.toUpperCase()}`;
  }
  const src = LINEAR_UNITS[from];
  const dst = LINEAR_UNITS[to];
  if (!src || !dst) throw new Error(`Unsupported unit "${!src ? fromRaw : toRaw}".`);
  if (src.group !== dst.group) {
    throw new Error(`Cannot convert ${src.group} ("${from}") to ${dst.group} ("${to}").`);
  }
  const converted = (value * src.toBase) / dst.toBase;
  return `${Number(converted.toFixed(6))} ${to}`;
}

/** Creates the default read-only safe tool registry for PROXIMA's agent loop. */
export function createDefaultToolRegistry(): AgentToolRegistry {
  return new AgentToolRegistry()
    .register({
      name: "calculate",
      description: "Evaluate a safe numeric arithmetic expression (+, -, *, /, ^, parentheses).",
      permission: "read-only",
      requiresApproval: false,
      schema: z.object({ expression: z.string().min(1).max(200) }).strict(),
      execute: ({ expression }) => String(safeEvaluateMath(expression)),
    })
    .register({
      name: "validate_json",
      description: "Validate and pretty-print a JSON string, reporting exact syntax errors if invalid.",
      permission: "read-only",
      requiresApproval: false,
      schema: z.object({ input: z.string().min(1).max(50_000) }).strict(),
      execute: ({ input }) => {
        const parsed: unknown = JSON.parse(input);
        return JSON.stringify(parsed, null, 2);
      },
    })
    .register({
      name: "current_time",
      description: "Return the current UTC ISO-8601 timestamp.",
      permission: "read-only",
      requiresApproval: false,
      schema: z.object({}).strict(),
      execute: () => new Date().toISOString(),
    })
    .register({
      name: "convert_units",
      description:
        "Convert a numeric value between length (mm,cm,m,km,in,ft,yd,mi), mass (mg,g,kg,oz,lb), temperature (C,F,K), data (B,KB,MB,GB,TB), or time (ms,s,min,hr,day).",
      permission: "read-only",
      requiresApproval: false,
      schema: z
        .object({
          value: z.number().finite(),
          from: z.string().min(1).max(16),
          to: z.string().min(1).max(16),
        })
        .strict(),
      execute: ({ value, from, to }) => convertUnits(value, from, to),
    })
    .register({
      name: "analyze_text",
      description: "Compute word count, character count, line count, estimated reading time, and top terms.",
      permission: "read-only",
      requiresApproval: false,
      schema: z.object({ text: z.string().min(1).max(50_000) }).strict(),
      execute: ({ text }) => {
        const words = text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? [];
        const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
        const lines = text.split(/\r?\n/).length;
        const freq = new Map<string, number>();
        for (const w of words) {
          if (w.length < 3) continue;
          freq.set(w, (freq.get(w) ?? 0) + 1);
        }
        const topWords = Array.from(freq.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 8)
          .map(([word, count]) => ({ word, count }));
        return JSON.stringify({
          characters: text.length,
          words: words.length,
          sentences,
          lines,
          readingTimeSeconds: Math.max(1, Math.round((words.length / 200) * 60)),
          topWords,
        });
      },
    })
    .register({
      name: "extract_structured",
      description: "Extract emails, urls, dates (YYYY-MM-DD), numbers, or markdown headings from text.",
      permission: "read-only",
      requiresApproval: false,
      schema: z
        .object({
          text: z.string().min(1).max(50_000),
          kind: z.enum(["emails", "urls", "dates", "numbers", "headings"]),
        })
        .strict(),
      execute: ({ text, kind }) => {
        const patterns: Record<typeof kind, RegExp> = {
          emails: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
          urls: /\bhttps?:\/\/[^\s<>()]+/g,
          dates: /\b\d{4}-\d{2}-\d{2}\b/g,
          numbers: /-?\b\d+(?:\.\d+)?\b/g,
          headings: /^#{1,6}\s+.+$/gm,
        };
        const matches = Array.from(new Set(text.match(patterns[kind]) ?? [])).slice(0, 50);
        return JSON.stringify({ kind, count: matches.length, items: matches });
      },
    })
    .register({
      name: "format_table",
      description: "Format headers and rows into a clean, escaped Markdown table.",
      permission: "read-only",
      requiresApproval: false,
      schema: z
        .object({
          headers: z.array(z.string().max(120)).min(1).max(12),
          rows: z.array(z.array(z.string().max(240)).max(12)).max(100),
        })
        .strict(),
      execute: ({ headers, rows }) => {
        const esc = (cell: string) => cell.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
        const headerLine = `| ${headers.map(esc).join(" | ")} |`;
        const divider = `| ${headers.map(() => "---").join(" | ")} |`;
        const body = rows.map(
          (row) => `| ${headers.map((_, i) => esc(row[i] ?? "")).join(" | ")} |`,
        );
        return [headerLine, divider, ...body].join("\n");
      },
    });
}
