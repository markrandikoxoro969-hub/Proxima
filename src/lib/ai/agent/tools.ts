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
    });
}
