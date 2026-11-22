import { describe, expect, it } from "vitest";
import { temporaryHistory } from "./history";

describe("temporaryHistory", () => {
  it("retains only user image IDs from recent turns without bytes", () => {
    const image = {
      kind: "image" as const,
      name: "photo.jpg",
      size: 0,
      language: "",
      imageId: "img1",
      url: "/api/images/img1",
    };
    const history = temporaryHistory([
      ...Array.from({ length: 20 }, () => ({ role: "user" as const, content: "old", attachments: null })),
      { role: "user", content: "what is this?", attachments: [image] },
      { role: "assistant", content: "a cat", attachments: [image] },
    ]);
    expect(history).toHaveLength(20);
    expect(history.at(-2)).toEqual({ role: "user", content: "what is this?", images: [{ id: "img1" }] });
    expect(history.at(-1)).toEqual({ role: "assistant", content: "a cat" });
  });
});
