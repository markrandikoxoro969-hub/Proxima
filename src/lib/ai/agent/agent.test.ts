import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createAgentCheckpoint,
  createDefaultToolRegistry,
  executeNextAgentStep,
  parseToolCallFallback,
  readAgentCheckpoint,
} from "./index";

describe("PROXIMA Universal Agent Architecture", () => {
  it("executes Plan → Act → Observe → Evaluate → Continue → Verify end-to-end", async () => {
    const registry = createDefaultToolRegistry();
    let checkpoint = createAgentCheckpoint("Compute and validate payload", [
      "Calculate total",
      "Validate JSON result",
    ]);

    expect(checkpoint.phase).toBe("act");
    expect(readAgentCheckpoint(JSON.parse(JSON.stringify(checkpoint)))).toEqual(checkpoint);

    // Step 1: calculate
    checkpoint = await executeNextAgentStep({
      checkpoint,
      registry,
      ctx: { userId: "u1" },
      resolveAction: () => ({
        id: "c1",
        toolName: "calculate",
        args: { expression: "(12 + 8) * 3" },
      }),
    });
    expect(checkpoint.phase).toBe("continue");
    expect(checkpoint.steps[0].status).toBe("completed");
    expect(checkpoint.steps[0].observation?.output).toBe("60");

    // Step 2: validate_json
    checkpoint = await executeNextAgentStep({
      checkpoint,
      registry,
      ctx: { userId: "u1" },
      resolveAction: () => ({
        id: "c2",
        toolName: "validate_json",
        args: { input: '{"total":60}' },
      }),
    });
    expect(checkpoint.phase).toBe("verify");
    expect(checkpoint.steps[1].status).toBe("completed");

    // Final Verify pass
    checkpoint = await executeNextAgentStep({
      checkpoint,
      registry,
      ctx: { userId: "u1" },
      resolveAction: () => null,
    });
    expect(checkpoint.phase).toBe("done");
    expect(checkpoint.verificationNote).toContain("2/2");
  });

  it("pauses destructive tools for explicit user approval and resumes once approved", async () => {
    const registry = createDefaultToolRegistry().register({
      name: "delete_draft",
      description: "Delete a saved draft item.",
      permission: "destructive",
      requiresApproval: true,
      schema: z.object({ id: z.string().min(1) }).strict(),
      execute: ({ id }) => `deleted:${id}`,
    });

    let checkpoint = createAgentCheckpoint("Clean up old draft", ["Delete draft"]);

    // First attempt without approval pauses cleanly.
    checkpoint = await executeNextAgentStep({
      checkpoint,
      registry,
      ctx: { userId: "u1" },
      resolveAction: () => ({ id: "c1", toolName: "delete_draft", args: { id: "d-42" } }),
    });
    expect(checkpoint.phase).toBe("paused");
    expect(checkpoint.pendingApprovalStepId).toBe("step-1");
    expect(checkpoint.steps[0].status).toBe("awaiting-approval");

    // Resume with explicit approval for step-1.
    checkpoint = await executeNextAgentStep({
      checkpoint,
      registry,
      ctx: { userId: "u1" },
      resolveAction: () => null,
      approvedStepId: "step-1",
    });
    expect(checkpoint.steps[0].status).toBe("completed");
    expect(checkpoint.steps[0].observation?.output).toBe("deleted:d-42");
  });

  it("rejects invalid tool arguments and recovers via bounded retries", async () => {
    const registry = createDefaultToolRegistry();
    let checkpoint = createAgentCheckpoint("Handle bad args", ["Compute ratio"], {
      maxRetriesPerStep: 1,
    });

    // Attempt 1 fails validation (division by zero).
    checkpoint = await executeNextAgentStep({
      checkpoint,
      registry,
      ctx: { userId: "u1" },
      resolveAction: () => ({ id: "c1", toolName: "calculate", args: { expression: "10 / 0" } }),
    });
    expect(checkpoint.phase).toBe("evaluate");
    expect(checkpoint.steps[0].attempts).toBe(1);
    expect(checkpoint.steps[0].status).toBe("pending");

    // Attempt 2 exhausts retry budget and transitions cleanly to failed.
    checkpoint = await executeNextAgentStep({
      checkpoint,
      registry,
      ctx: { userId: "u1" },
      resolveAction: () => ({ id: "c2", toolName: "calculate", args: { expression: "10 / 0" } }),
    });
    expect(checkpoint.phase).toBe("failed");
    expect(checkpoint.steps[0].status).toBe("failed");
  });

  it("parses fallback JSON tool calls for providers without native tool calling", () => {
    const parsed = parseToolCallFallback(
      'I will compute that now:\n```json\n{"tool": "calculate", "args": {"expression": "2^8"}}\n```',
      "fb-1",
    );
    expect(parsed).toEqual({
      id: "fb-1",
      toolName: "calculate",
      args: { expression: "2^8" },
    });
    expect(parseToolCallFallback("plain assistant reply without json")).toBeNull();
  });

  it("executes expanded sandboxed tools (convert_units, analyze_text, extract_structured, format_table)", async () => {
    const registry = createDefaultToolRegistry();
    const ctx = { userId: "u1" };

    const temp = await registry.invoke({
      callId: "u1",
      toolName: "convert_units",
      args: { value: 100, from: "C", to: "F" },
      ctx,
    });
    expect(temp.ok).toBe(true);
    expect(temp.output).toBe("212 F");

    const badUnit = await registry.invoke({
      callId: "u2",
      toolName: "convert_units",
      args: { value: 5, from: "kg", to: "km" },
      ctx,
    });
    expect(badUnit.ok).toBe(false);
    expect(badUnit.error).toContain("Cannot convert");

    const metrics = await registry.invoke({
      callId: "a1",
      toolName: "analyze_text",
      args: { text: "Proxima builds fast glass interfaces. Glass interfaces stay readable." },
      ctx,
    });
    expect(metrics.ok).toBe(true);
    expect(JSON.parse(metrics.output)).toMatchObject({ words: 9, sentences: 2 });

    const extracted = await registry.invoke({
      callId: "e1",
      toolName: "extract_structured",
      args: { text: "Reach ops@proxima.ai or visit https://proxima.ai by 2026-11-25.", kind: "emails" },
      ctx,
    });
    expect(extracted.ok).toBe(true);
    expect(JSON.parse(extracted.output)).toEqual({
      kind: "emails",
      count: 1,
      items: ["ops@proxima.ai"],
    });

    const table = await registry.invoke({
      callId: "t1",
      toolName: "format_table",
      args: {
        headers: ["Metric", "Value"],
        rows: [
          ["Latency", "120ms"],
          ["Status", "OK"],
        ],
      },
      ctx,
    });
    expect(table.ok).toBe(true);
    expect(table.output).toContain("| Metric | Value |");
    expect(table.output).toContain("| Latency | 120ms |");
  });
});
