import type { z } from "zod";

/**
 * PROXIMA Universal Autonomous Agent Architecture
 * -----------------------------------------------
 * Built around the deterministic six-stage loop:
 *   Plan → Act → Observe → Evaluate → Continue → Verify
 *
 * Designed for serverless reliability (Vercel execution limits):
 * every step serializes cleanly into `Message.generationProgress` so
 * interrupted runs resume from the last completed checkpoint instead of
 * restarting from scratch.
 */

export type AgentPhase = "plan" | "act" | "observe" | "evaluate" | "continue" | "verify" | "done" | "paused" | "failed";

/** Security & approval boundary for every registered tool. */
export type ToolPermission = "read-only" | "workspace-write" | "destructive";

export type AgentStepStatus =
  | "pending"
  | "running"
  | "awaiting-approval"
  | "completed"
  | "failed"
  | "skipped";

export type AgentToolCall = {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
};

export type AgentToolResult = {
  callId: string;
  toolName: string;
  ok: boolean;
  output: string;
  error?: string;
  durationMs: number;
};

export type AgentStep = {
  id: string;
  title: string;
  status: AgentStepStatus;
  attempts: number;
  toolCall?: AgentToolCall;
  observation?: AgentToolResult;
  evaluation?: string;
};

export type AgentBudget = {
  maxSteps: number;
  maxRetriesPerStep: number;
  maxToolOutputChars: number;
  stepTimeoutMs: number;
};

export const DEFAULT_AGENT_BUDGET: AgentBudget = {
  maxSteps: 10,
  maxRetriesPerStep: 2,
  maxToolOutputChars: 8_000,
  stepTimeoutMs: 25_000,
};

/** Serializable checkpoint stored in `Message.generationProgress` across serverless requests. */
export type AgentCheckpoint = {
  kind: "universal-agent";
  version: 1;
  goal: string;
  phase: AgentPhase;
  steps: AgentStep[];
  currentStepIndex: number;
  budget: AgentBudget;
  pendingApprovalStepId: string | null;
  verificationNote: string | null;
  updatedAt: string;
};

export type AgentToolContext = {
  userId: string;
  signal?: AbortSignal;
};

export type AgentToolDefinition<TInput = Record<string, unknown>> = {
  name: string;
  description: string;
  permission: ToolPermission;
  /** True when the tool must pause and request explicit user approval before running. */
  requiresApproval: boolean;
  schema: z.ZodType<TInput>;
  execute: (args: TInput, ctx: AgentToolContext) => Promise<string> | string;
};
