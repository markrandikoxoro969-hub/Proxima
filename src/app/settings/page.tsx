import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { requireUser, toProfile } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { buildSkillState } from "@/lib/skills/catalog";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

/**
 * /settings — everything about your account on one page:
 * profile, appearance, default chat skills, data controls, sign out, and account deletion.
 * Protected: guests are sent to /login first (src/proxy.ts + requireUser).
 */
export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const [chatCount, installations] = await Promise.all([
    db.conversation.count({ where: { userId: user.id } }),
    db.userSkill.findMany({
      where: { userId: user.id },
      select: { skillId: true, enabled: true, selected: true },
    }),
  ]);
  return (
    <SettingsView
      profile={toProfile(user)}
      chatCount={chatCount}
      initialSkills={buildSkillState(installations)}
    />
  );
}
