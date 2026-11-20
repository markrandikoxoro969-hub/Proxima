import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits";
import { chatRequestSchema, historyMessageSchema } from "./validation";

describe("chat request validation", () => {
  it("trims long earlier replies instead of rejecting the whole message", () => {
    const parsed = chatRequestSchema.safeParse({
      message: "What next?",
      history: [{ role: "assistant", content: "x".repeat(20_000) }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.history?.[0]?.content).toHaveLength(LIMITS.historyMessageMax);
  });

  it("still rejects an empty history message with a readable error", () => {
    const parsed = historyMessageSchema.safeParse({ role: "assistant", content: "   " });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toBe("A history message can't be empty.");
  });

  it("keeps the friendly message limit for a new message", () => {
    const parsed = chatRequestSchema.safeParse({ message: "x".repeat(LIMITS.messageMax + 1) });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        `Message must be ${LIMITS.messageMax} characters or fewer.`,
      );
    }
  });
});
