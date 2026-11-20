import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { requireUser, toProfile } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

/**
 * /settings — everything about your account on one page:
 * profile, appearance, download/delete your data, sign out, delete account.
 * Protected: guests are sent to /login first (src/proxy.ts + requireUser).
 */
export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const chatCount = await db.conversation.count({ where: { userId: user.id } });
  return <SettingsView profile={toProfile(user)} chatCount={chatCount} />;
}
