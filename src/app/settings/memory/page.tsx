import type { Metadata } from "next";
import { MemoryView } from "@/components/settings/memory-view";
import { ToastProvider } from "@/components/ui/toast";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listMemories } from "@/lib/memory/store";

export const metadata: Metadata = { title: "Memory", robots: { index: false, follow: false } };

/**
 * /settings/memory — every note PROXIMA keeps about you, in one place.
 *
 * Nothing here is written by the browser: the list is read on the server, and
 * each change goes through /api/memory (which checks the signed-in user).
 */
export default async function MemorySettingsPage() {
  const user = await requireUser("/settings/memory");
  const [memories, settings] = await Promise.all([
    listMemories(user.id),
    db.user.findUnique({ where: { id: user.id }, select: { memoryEnabled: true, memoryConsentAt: true } }),
  ]);

  return (
    <ToastProvider>
      <MemoryView
        enabled={Boolean(settings?.memoryEnabled)}
        consented={settings?.memoryConsentAt !== null && settings?.memoryConsentAt !== undefined}
        memories={memories.map((memory) => ({
          id: memory.id,
          text: memory.text,
          category: memory.category,
          createdAt: memory.createdAt.toISOString(),
          expiresAt: memory.expiresAt ? memory.expiresAt.toISOString() : null,
        }))}
      />
    </ToastProvider>
  );
}
