import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorResponse } from "./http";

const bodyOf = async (response: Response) =>
  (await response.json()) as { error: { code: string; message: string; fields?: { message: string }[] } };

describe("errorResponse", () => {
  it("turns Zod's developer message into plain language", async () => {
    const parsed = z.string().max(10).safeParse("x".repeat(11));
    expect(parsed.success).toBe(false);
    const response = errorResponse(parsed.error);
    const body = await bodyOf(response);
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
    expect(body.error.message).toBe("That input is too long.");
    expect(body.error.message).not.toMatch(/expected string/i);
  });

  it("keeps a custom message written for people", async () => {
    const parsed = z.string().max(10, "Keep it under ten characters.").safeParse("x".repeat(11));
    expect(parsed.success).toBe(false);
    const body = await bodyOf(errorResponse(parsed.error));
    expect(body.error.message).toBe("Keep it under ten characters.");
  });
});
