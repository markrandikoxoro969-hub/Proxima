import { describe, expect, it } from "vitest";
import type { SessionSummary } from "@/lib/chat/types";
import { filterSessions, groupSessionsByDate } from "./group-sessions";

const make = (id: string, title: string, updatedAt: string): SessionSummary => ({
  id,
  title,
  messageCount: 2,
  createdAt: updatedAt,
  updatedAt,
});

describe("groupSessionsByDate & filterSessions", () => {
  const now = new Date("2026-11-25T15:00:00");

  it("groups conversations cleanly into Today, Yesterday, 7d, 30d, and Older", () => {
    const sessions = [
      make("1", "Today chat", "2026-11-25T10:00:00"),
      make("2", "Yesterday chat", "2026-11-24T18:00:00"),
      make("3", "Three days ago", "2026-11-22T09:00:00"),
      make("4", "Two weeks ago", "2026-11-10T12:00:00"),
      make("5", "Ancient chat", "2026-08-01T12:00:00"),
    ];

    const groups = groupSessionsByDate(sessions, now);
    expect(groups.map((g) => g.label)).toEqual([
      "Today",
      "Yesterday",
      "Previous 7 Days",
      "Previous 30 Days",
      "Older",
    ]);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(["1"]);
    expect(groups[1].sessions.map((s) => s.id)).toEqual(["2"]);
    expect(groups[2].sessions.map((s) => s.id)).toEqual(["3"]);
    expect(groups[3].sessions.map((s) => s.id)).toEqual(["4"]);
    expect(groups[4].sessions.map((s) => s.id)).toEqual(["5"]);
  });

  it("filters sessions case-insensitively and handles blank queries", () => {
    const sessions = [
      make("1", "Next.js Glass UI", "2026-11-25T10:00:00"),
      make("2", "Prisma migration", "2026-11-24T10:00:00"),
    ];

    expect(filterSessions(sessions, "   ")).toHaveLength(2);
    expect(filterSessions(sessions, "GLASS").map((s) => s.id)).toEqual(["1"]);
    expect(filterSessions(sessions, "missing")).toEqual([]);
  });
});
