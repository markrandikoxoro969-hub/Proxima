import "server-only";
import { generateReply } from "../reply";
import type { AiProvider, AiRequest } from "../types";
import { parseToolCallFallback } from "./planner";
import type { AgentToolRegistry } from "./tools";
import type { AgentCheckpoint, AgentStep, AgentToolCall } from "./types";

const MAX_AGENT_STEPS = 6;

/** Detects an explicit autonomous agent request (`/agent <goal>` or `agentMode: true`). */
export function isAgentTaskRequest(message: string, agentMode?: boolean): boolean {
  if (agentMode === true) return true;
  return /^\/agent(?:\s+|$)/i.test(message.trim());
}

/** Strips an optional leading `/agent` command prefix to reveal the user's goal. */
export function stripAgentPrefix(message: string): string {
  return message.trim().replace(/^\/agent\s*/i, "").trim();
}

async function collectProviderText(provider: AiProvider, req: AiRequest): Promise<string> {
  let out = "";
  for await (const delta of generateReply(provider, req)) {
    if (delta.type === "text") out += delta.text;
  }
  return out.trim();
}

/** Parses `{"steps": ["..."]}` from model output with a resilient fallback. */
export function parseAgentPlan(text: string, fallbackGoal: string): string[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as { steps?: unknown };
      if (Array.isArray(parsed.steps)) {
        const clean = parsed.steps
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().slice(0, 180))
          .filter(Boolean)
          .slice(0, MAX_AGENT_STEPS);
        if (clean.length > 0) return clean;
      }
    } catch {
      /* fall through to single-step fallback */
    }
  }
  return [fallbackGoal.slice(0, 180) || "Complete the requested task"];
}

/**
 * Stage 1 (Plan): Breaks the user's goal into bounded, ordered steps using the
 * active AI provider and the registered sandboxed tools.
 */
export async function planAgentSteps(
  provider: AiProvider,
  req: AiRequest,
  registry: AgentToolRegistry,
): Promise<string[]> {
  const goal = stripAgentPrefix(req.message);
  const planSystem = [
    req.system,
    "You are PROXIMA's autonomous task planner.",
    "Break the user's goal into 1 to 5 concise, verifiable steps.",
    "Available sandboxed tools:\n" + registry.describeForPrompt(),
    'Respond with ONLY JSON in this exact format: {"steps":["Step 1","Step 2"]}. No markdown fences or commentary.',
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await collectProviderText(provider, {
    ...req,
    message: `Goal: ${goal}`,
    system: planSystem,
    showReasoning: false,
  });
  return parseAgentPlan(raw, goal);
}

/**
 * Stage 2 (Act selection): Decides whether the current step requires a registered
 * sandboxed tool call or can complete directly via reasoning.
 */
export async function resolveAgentAction(
  provider: AiProvider,
  req: AiRequest,
  step: AgentStep,
  checkpoint: AgentCheckpoint,
  registry: AgentToolRegistry,
): Promise<AgentToolCall | null> {
  const priorNotes = checkpoint.steps
    .filter((s) => s.status === "completed")
    .map((s) =>
      s.observation
        ? `- ${s.title} -> tool ${s.observation.toolName}: ${s.observation.output}`
        : `- ${s.title} -> ${s.evaluation ?? "done"}`,
    )
    .join("\n");

  const actionSystem = [
    req.system,
    "You are executing one step of a multi-step task inside PROXIMA's sandboxed agent loop.",
    "Available tools (strict JSON schemas):\n" + registry.describeForPrompt(),
    "If a tool is helpful for this step, reply with ONLY JSON: {\"tool\":\"<name>\",\"args\":{...}}.",
    'If no tool is needed for this step, reply with ONLY JSON: {"tool":null,"args":{}}.',
    "Never invent tools outside the available list.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await collectProviderText(provider, {
    ...req,
    message: [
      `Goal: ${checkpoint.goal}`,
      priorNotes ? `Completed steps:\n${priorNotes}` : null,
      `Current step (${step.id}): ${step.title}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    system: actionSystem,
    showReasoning: false,
  });

  const parsed = parseToolCallFallback(raw, `call-${step.id}-${step.attempts + 1}`);
  if (!parsed || !registry.get(parsed.toolName)) return null;
  return parsed;
}

/**
 * Stage 6 (Verify & Finalize): Produces the final grounded answer from all
 * observed tool outputs and completed checkpoint steps.
 */
export async function synthesizeAgentAnswer(
  provider: AiProvider,
  req: AiRequest,
  checkpoint: AgentCheckpoint,
): Promise<string> {
  const observations = checkpoint.steps
    .map((step, i) => {
      const obs = step.observation
        ? step.observation.ok
          ? `Tool \`${step.observation.toolName}\` output: ${step.observation.output}`
          : `Tool \`${step.observation.toolName}\` error: ${step.observation.error ?? "failed"}`
        : step.evaluation ?? step.status;
      return `${i + 1}. ${step.title} [${step.status}]\n   ${obs}`;
    })
    .join("\n");

  const verifySystem = [
    req.system,
    "You are finishing a verified multi-step agent run.",
    "Present a clear, direct, accurate final answer grounded strictly in the verified step observations below.",
    "Do not invent tool results that did not occur.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return collectProviderText(provider, {
    ...req,
    message: `Goal: ${checkpoint.goal}\n\nVerified execution log:\n${observations}`,
    system: verifySystem,
    showReasoning: false,
  });
}

/** Formats a transparent, scannable Markdown summary of a completed agent step. */
export function formatAgentStepNote(step: AgentStep, index: number, total: number): string {
  const header = `> **Step ${index + 1}/${total}:** ${step.title}`;
  if (step.observation?.ok) {
    const preview = step.observation.output.replace(/\s+/g, " ").slice(0, 160);
    return `${header} — \`${step.observation.toolName}\` → \`${preview}\`\n`;
  }
  return `${header} — verified\n`;
}
