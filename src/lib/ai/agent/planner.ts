import {
  DEFAULT_AGENT_BUDGET,
  type AgentBudget,
  type AgentCheckpoint,
  type AgentStep,
  type AgentToolCall,
  type AgentToolContext,
} from "./types";
import type { AgentToolRegistry } from "./tools";

/**
 * Creates a fresh persistent checkpoint at the `plan` stage.
 * Can be saved directly into `Message.generationProgress` and resumed across
 * multiple serverless turns without losing completed work.
 */
export function createAgentCheckpoint(
  goal: string,
  stepTitles: readonly string[],
  budget: Partial<AgentBudget> = {},
): AgentCheckpoint {
  const mergedBudget: AgentBudget = { ...DEFAULT_AGENT_BUDGET, ...budget };
  const boundedTitles = stepTitles
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, mergedBudget.maxSteps);

  const steps: AgentStep[] = boundedTitles.map((title, index) => ({
    id: `step-${index + 1}`,
    title,
    status: "pending",
    attempts: 0,
  }));

  return {
    kind: "universal-agent",
    version: 1,
    goal: goal.trim(),
    phase: steps.length > 0 ? "act" : "verify",
    steps,
    currentStepIndex: 0,
    budget: mergedBudget,
    pendingApprovalStepId: null,
    verificationNote: null,
    updatedAt: new Date().toISOString(),
  };
}

/** Validates an unknown JSON payload loaded from `Message.generationProgress`. */
export function readAgentCheckpoint(value: unknown): AgentCheckpoint | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AgentCheckpoint>;
  if (raw.kind !== "universal-agent" || raw.version !== 1) return null;
  if (typeof raw.goal !== "string" || !Array.isArray(raw.steps)) return null;
  if (typeof raw.currentStepIndex !== "number") return null;
  return raw as AgentCheckpoint;
}

/**
 * Controlled fallback tool-call parser for providers that do not support native
 * function calling. Expects a fenced or bare JSON block:
 *   {"tool": "calculate", "args": {"expression": "2+2"}}
 */
export function parseToolCallFallback(text: string, callId = "call-1"): AgentToolCall | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { tool?: unknown; args?: unknown };
    if (typeof parsed.tool !== "string" || !parsed.tool.trim()) return null;
    if (!parsed.args || typeof parsed.args !== "object" || Array.isArray(parsed.args)) return null;
    return {
      id: callId,
      toolName: parsed.tool.trim(),
      args: parsed.args as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/**
 * Executes ONE bounded step of the Plan → Act → Observe → Evaluate → Continue → Verify
 * loop and returns the updated serializable checkpoint.
 *
 * Designed so each serverless invocation executes safely within Vercel timeouts,
 * persists the returned checkpoint, and can resume seamlessly after interruptions
 * or user approval prompts.
 */
export async function executeNextAgentStep(options: {
  checkpoint: AgentCheckpoint;
  registry: AgentToolRegistry;
  ctx: AgentToolContext;
  /** Supplies the next tool call (or null for pure reasoning step) for the current step. */
  resolveAction: (step: AgentStep, checkpoint: AgentCheckpoint) => Promise<AgentToolCall | null> | AgentToolCall | null;
  /** Optional explicit user approval for the pending approval step. */
  approvedStepId?: string;
}): Promise<AgentCheckpoint> {
  const { checkpoint, registry, ctx, resolveAction, approvedStepId } = options;

  if (checkpoint.phase === "done" || checkpoint.phase === "failed") {
    return checkpoint;
  }

  // All planned steps complete → enter final Verify stage.
  if (checkpoint.currentStepIndex >= checkpoint.steps.length) {
    const failedSteps = checkpoint.steps.filter((s) => s.status === "failed");
    return {
      ...checkpoint,
      phase: failedSteps.length === 0 ? "done" : "failed",
      pendingApprovalStepId: null,
      verificationNote:
        failedSteps.length === 0
          ? `Verified ${checkpoint.steps.length}/${checkpoint.steps.length} steps completed.`
          : `${failedSteps.length} step(s) failed after retries.`,
      updatedAt: new Date().toISOString(),
    };
  }

  const steps = checkpoint.steps.map((s) => ({ ...s }));
  const step = steps[checkpoint.currentStepIndex];

  // Plan → Act: determine tool call (reuse pending call when resuming after approval).
  const toolCall = step.toolCall ?? (await resolveAction(step, checkpoint));
  if (!toolCall) {
    step.status = "completed";
    step.evaluation = "Completed without external tool execution.";
    const nextIndex = checkpoint.currentStepIndex + 1;
    return {
      ...checkpoint,
      phase: nextIndex >= steps.length ? "verify" : "continue",
      steps,
      currentStepIndex: nextIndex,
      pendingApprovalStepId: null,
      updatedAt: new Date().toISOString(),
    };
  }

  step.toolCall = toolCall;

  // Approval gate for destructive or approval-required tools.
  const needsApproval = registry.requiresApproval(toolCall.toolName);
  const isApproved = !needsApproval || approvedStepId === step.id;
  if (!isApproved) {
    step.status = "awaiting-approval";
    return {
      ...checkpoint,
      phase: "paused",
      steps,
      pendingApprovalStepId: step.id,
      updatedAt: new Date().toISOString(),
    };
  }

  // Act → Observe
  step.status = "running";
  step.attempts += 1;
  const observation = await registry.invoke({
    callId: toolCall.id,
    toolName: toolCall.toolName,
    args: toolCall.args,
    ctx,
    approved: isApproved,
    timeoutMs: checkpoint.budget.stepTimeoutMs,
    maxOutputChars: checkpoint.budget.maxToolOutputChars,
  });
  step.observation = observation;

  // Evaluate → Continue / Retry / Fail
  if (observation.ok) {
    step.status = "completed";
    step.evaluation = "Tool succeeded; advancing to next step.";
    const nextIndex = checkpoint.currentStepIndex + 1;
    return {
      ...checkpoint,
      phase: nextIndex >= steps.length ? "verify" : "continue",
      steps,
      currentStepIndex: nextIndex,
      pendingApprovalStepId: null,
      updatedAt: new Date().toISOString(),
    };
  }

  if (step.attempts <= checkpoint.budget.maxRetriesPerStep) {
    step.status = "pending";
    step.evaluation = `Attempt ${step.attempts} failed (${observation.error ?? "error"}); eligible for retry.`;
    return {
      ...checkpoint,
      phase: "evaluate",
      steps,
      pendingApprovalStepId: null,
      updatedAt: new Date().toISOString(),
    };
  }

  step.status = "failed";
  step.evaluation = `Exhausted retries: ${observation.error ?? "unknown error"}`;
  return {
    ...checkpoint,
    phase: "failed",
    steps,
    pendingApprovalStepId: null,
    verificationNote: `Step "${step.title}" failed after ${step.attempts} attempts.`,
    updatedAt: new Date().toISOString(),
  };
}
