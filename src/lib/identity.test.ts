import { describe, expect, it } from "vitest";
import {
  cleanIdentityLeaks,
  describeAge,
  getIdentityAnswer,
  identitySystemSection,
} from "./identity";

const kind = (msg: string) => {
  const answer = getIdentityAnswer(msg, new Date("2026-11-25T12:30:00Z"));
  if (!answer) return null;
  if (answer.includes("developed by")) return "developer";
  if (answer.includes("still counting")) return "age";
  if (answer.includes("female AI assistant")) return "gender";
  if (answer.includes("Ask me anything")) return "who";
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

  it("fills every placeholder with updated 1.0.2VBETA core and saved developers", () => {
    const answer = getIdentityAnswer("who made you", new Date("2026-11-25T12:30:00Z"))!;
    expect(answer).toContain("Proxima");
    expect(answer).toContain("1.0.2VBETA");
    expect(answer).toContain("Sujan Shrestha");
    expect(answer).toContain("Aayusha Shrestha");
    expect(answer).toContain("https://m.facebook.com/");
    expect(answer).not.toMatch(/\{\w+\}/);
  });
});

describe("describeAge & identitySystemSection", () => {
  it("starts at 6 months on 2026-11-25 and ticks live continuously from now", () => {
    expect(describeAge(new Date("2026-11-25T00:00:00Z"))).toBe("6 months, 0h 0m");
    expect(describeAge(new Date("2026-11-25T14:25:00Z"))).toBe("6 months, 14h 25m");
    expect(describeAge(new Date("2026-11-27T05:10:00Z"))).toBe("6 months, 2 days, 5h 10m");
  });

  it("injects natural live identity instructions for the AI system prompt", () => {
    const section = identitySystemSection(new Date("2026-11-25T10:15:00Z"));
    expect(section).toContain("Name: Proxima");
    expect(section).toContain("Core version: 1.0.2VBETA");
    expect(section).toContain("6 months, 10h 15m");
    expect(section).toContain("Sujan Shrestha");
    expect(section).toContain("Aayusha Shrestha");
  });
});

describe("cleanIdentityLeaks", () => {
  it("replaces model self-descriptions", () => {
    expect(cleanIdentityLeaks("Sure! I am a large language model, trained by Google. Here you go.")).toBe(
      "Sure! I am Proxima, a private AI assistant developed by Sujan Shrestha. Here you go.",
    );
  });
  it("leaves normal text alone", () => {
    expect(cleanIdentityLeaks("Google Maps is useful.")).toBe("Google Maps is useful.");
  });
});
