import { describe, expect, it } from "vitest";
import type { AiDelta, AiProvider, AiRequest } from "../types";
import { createAgentCheckpoint, createDefaultToolRegistry, executeNextAgentStep } from "./index";
import {
  isAgentTaskRequest,
  parseAgentPlan,
  planAgentSteps,
  resolveAgentAction,
  stripAgentPrefix,
  synthesizeAgentAnswer,
} from "./runner";

function makeScriptedProvider(replies: string[]): AiProvider {
  let idx = 0;
  return {
    id: "scripted-agent",
    label: "Scripted Agent",
    async *stream(): AsyncGenerator<AiDelta> {
      const text = replies[idx++] ?? "";
      yield { type: "text", text };
    },
  };
}

describe("PROXIMA Agent Runner (Server Integration)", () => {
  it("detects explicit /agent requests and strips the command prefix", () => {
    expect(isAgentTaskRequest("/agent compute 12 * 14")).toBe(true);
    expect(isAgentTaskRequest("hello world", true)).toBe(true);
    expect(isAgentTaskRequest("hello world")).toBe(false);
    expect(stripAgentPrefix("/agent   compute 12 * 14")).toBe("compute 12 * 14");
  });

  it("parses JSON step plans and falls back cleanly on plain text", () => {
    expect(parseAgentPlan('{"steps":["Calculate sum","Validate JSON"]}', "fallback")).toEqual([
      "Calculate sum",
      "Validate JSON",
    ]);
    expect(parseAgentPlan("not json at all", "Compute tax")).toEqual(["Compute tax"]);
  });

  it("plans, executes a sandboxed tool step, observes output, and synthesizes a verified answer", async () => {
    const provider = makeScriptedProvider([
      '{"steps":["Compute 15 * 4"]}',
      '{"tool":"calculate","args":{"expression":"15 * 4"}}',
      "The verified result of 15 * 4 is 60.",
    ]);
    const registry = createDefaultToolRegistry();
    const baseReq: AiRequest = {
      message: "/agent compute 15 * 4",
      sessionId: "s1",
      signal: new AbortController().signal,
      mode: "thinking",
      system: "Be concise.",
    };

    const steps = await planAgentSteps(provider, baseReq, registry);
    expect(steps).toEqual(["Compute 15 * 4"]);

    let checkpoint = createAgentCheckpoint("compute 15 * 4", steps);
    checkpoint = await executeNextAgentStep({
      checkpoint,
      registry,
      ctx: { userId: "u1" },
      resolveAction: (step, cp) => resolveAgentAction(provider, baseReq, step, cp, registry),
    });
    expect(checkpoint.steps[0].status).toBe("completed");
    expect(checkpoint.steps[0].observation?.output).toBe("60");

    checkpoint = await executeNextAgentStep({
      checkpoint,
      registry,
      ctx: { userId: "u1" },
      resolveAction: () => null,
    });
    expect(checkpoint.phase).toBe("done");

    const final = await synthesizeAgentAnswer(provider, baseReq, checkpoint);
    expect(final).toContain("60");
  });
});
