import { describe, expect, it } from "vitest";
import { cleanIdentityLeaks, describeAge, getIdentityAnswer } from "./identity";

const kind = (msg: string) => {
  const answer = getIdentityAnswer(msg, new Date("2026-11-19T12:00:00Z"));
  if (!answer) return null;
  if (answer.includes("developed and created by")) return "developer";
  if (answer.includes("since my latest")) return "age";
  if (answer.includes("identify as a **female**")) return "gender";
  if (answer.includes("Premium Female AI Assistant")) return "who";
  return "other";
};

describe("identity answers", () => {
  it.each([
    "who made you?",
    "Who created Proxima",
    "who is your developer",
    "Who's your creator?",
    "which company built you",
    "were you made by Google?",
    "who is the developer of this app",
    "who is Sujan",
    "proxima's owner?",
  ])("developer: %s", (msg) => expect(kind(msg)).toBe("developer"));

  it.each(["how old are you", "What's your age?", "when were you born"])("age: %s", (msg) =>
    expect(kind(msg)).toBe("age"),
  );

  it.each(["what is your gender", "are you a girl?", "Are you male"])("gender: %s", (msg) =>
    expect(kind(msg)).toBe("gender"),
  );

  it.each(["who are you?", "What is Proxima", "introduce yourself", "what's your name"])(
    "who are you: %s",
    (msg) => expect(kind(msg)).toBe("who"),
  );

  // These matched by mistake in the original file.
  it.each([
    "What can you do?",
    "What do you think about cats?",
    "Who won the world cup? Can you tell me",
    "Write a clean Python script",
    "Explain how React developers build apps",
    "what is your opinion on rust vs go",
    "Who are you going to vote for in this story? write it",
    "",
  ])("NOT an identity question: %s", (msg) => expect(kind(msg)).toBeNull());

  it("fills every placeholder", () => {
    const answer = getIdentityAnswer("who made you")!;
    expect(answer).toContain("Sujan Shrestha");
    expect(answer).toContain("Aayusha Shrestha");
    expect(answer).toContain("https://m.facebook.com/");
    expect(answer).not.toMatch(/\{\w+\}/);
  });
});

describe("describeAge", () => {
  it("counts days from the configured birthday", () => {
    expect(describeAge(new Date("2026-11-19T12:00:00Z"))).toBe("4 days old");
    expect(describeAge(new Date("2026-11-16T01:00:00Z"))).toBe("1 day old");
    expect(describeAge(new Date("2027-03-15T00:00:00Z"))).toBe("3 months old");
  });
});

describe("cleanIdentityLeaks", () => {
  it("replaces model self-descriptions", () => {
    expect(cleanIdentityLeaks("Sure! I am a large language model, trained by Google. Here you go.")).toBe(
      "Sure! I am Proxima, a premium AI assistant developed by Sujan Shrestha. Here you go.",
    );
  });
  it("leaves normal text alone", () => {
    expect(cleanIdentityLeaks("Google Maps is useful.")).toBe("Google Maps is useful.");
  });
});
