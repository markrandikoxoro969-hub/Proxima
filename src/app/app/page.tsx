import type { Metadata } from "next";
import { z } from "zod";
import { ChatApp } from "@/components/chat/chat-app";
import { requireUser, toProfile } from "@/lib/auth/session";
import { getMessagesPage, listSessions } from "@/lib/chat/queries";
import type { MessagesPage } from "@/lib/chat/types";
import { db } from "@/lib/db";
import { getEnabledSkillSummaries } from "@/lib/skills/catalog";

export const metadata: Metadata = { title: "Chat", robots: { index: false, follow: false } };

/**
 * /app — the PROXIMA chat.
 * Runs on the server first: checks login, then loads your sidebar (and the
 * chat in ?c=… if any) in parallel, so the page arrives ready to use.
 */
export default async function AppPage({ searchParams }: PageProps<"/app">) {
  const user = await requireUser("/app");
  const { c } = await searchParams;
  const requestedId = z.cuid().safeParse(typeof c === "string" ? c : undefined);

  const [{ sessions, nextCursor }, activePage, enabledSkills] = await Promise.all([
    listSessions(user.id),
    requestedId.success ? loadOwnedConversation(user.id, requestedId.data) : Promise.resolve(null),
    db.userSkill.findMany({
      where: { userId: user.id, enabled: true },
      select: { skillId: true, enabled: true },
    }),
  ]);

  const profile = toProfile(user);

  return (
    <ChatApp
      profile={profile}
      initialSessions={sessions}
      initialNextCursor={nextCursor}
      initialActiveId={activePage ? requestedId.data! : null}
      initialActivePage={activePage}
      initialEnabledSkills={getEnabledSkillSummaries(enabledSkills)}
    />
  );
}

async function loadOwnedConversation(userId: string, id: string): Promise<MessagesPage | null> {
  const owned = await db.conversation.findFirst({ where: { id, userId }, select: { id: true } });
  return owned ? getMessagesPage(owned.id) : null;
}
