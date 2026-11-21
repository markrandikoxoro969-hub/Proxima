import type { Metadata } from "next";
import { SkillsMarketplace } from "@/components/skills/skills-marketplace";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { buildSkillState } from "@/lib/skills/catalog";

export const metadata: Metadata = {
  title: "Skills",
  description: "Discover and manage PROXIMA's built-in AI skills.",
  robots: { index: false, follow: false },
};

export default async function SkillsPage() {
  const user = await requireUser("/skills");
  const installations = await db.userSkill.findMany({
    where: { userId: user.id },
    select: { skillId: true, enabled: true },
  });

  return <SkillsMarketplace initialSkills={buildSkillState(installations)} />;
}
