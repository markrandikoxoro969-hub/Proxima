import type { SessionSummary } from "@/lib/chat/types";

export type SessionGroupLabel =
  | "Today"
  | "Yesterday"
  | "Previous 7 Days"
  | "Previous 30 Days"
  | "Older";

export type SessionGroup = {
  label: SessionGroupLabel;
  sessions: SessionSummary[];
};

const GROUP_ORDER: readonly SessionGroupLabel[] = [
  "Today",
  "Yesterday",
  "Previous 7 Days",
  "Previous 30 Days",
  "Older",
];

/** Case-insensitive title filter for instant sidebar chat search. */
export function filterSessions(sessions: readonly SessionSummary[], query: string): SessionSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...sessions];
  return sessions.filter((session) => session.title.toLowerCase().includes(needle));
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Buckets chat sessions chronologically relative to `now` (Today, Yesterday,
 * Previous 7 Days, Previous 30 Days, Older), preserving relative order inside
 * each group and omitting empty groups.
 */
export function groupSessionsByDate(
  sessions: readonly SessionSummary[],
  now: Date = new Date(),
): SessionGroup[] {
  const todayStart = startOfLocalDay(now);
  const DAY_MS = 86_400_000;
  const buckets = new Map<SessionGroupLabel, SessionSummary[]>();

  for (const session of sessions) {
    const raw = session.updatedAt || session.createdAt;
    const parsed = new Date(raw);
    let label: SessionGroupLabel = "Older";

    if (!Number.isNaN(parsed.getTime())) {
      const itemDay = startOfLocalDay(parsed);
      const diffDays = Math.floor((todayStart - itemDay) / DAY_MS);
      if (diffDays <= 0) label = "Today";
      else if (diffDays === 1) label = "Yesterday";
      else if (diffDays <= 7) label = "Previous 7 Days";
      else if (diffDays <= 30) label = "Previous 30 Days";
      else label = "Older";
    }

    const list = buckets.get(label);
    if (list) list.push(session);
    else buckets.set(label, [session]);
  }

  return GROUP_ORDER.filter((label) => buckets.has(label)).map((label) => ({
    label,
    sessions: buckets.get(label)!,
  }));
}
