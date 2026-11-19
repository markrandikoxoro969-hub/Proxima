import { withApi } from "@/lib/api/http";
import { requireApiUserId } from "@/lib/auth/api";
import { buildJsonExport, buildMarkdownExport, downloadResponse, exportFilename } from "@/lib/chat/export";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { exportFormatSchema } from "@/lib/validation";

/** GET /api/export?format=json|md — download ALL your chats (your data, your copy). */
export const GET = withApi(async (request: Request) => {
  const userId = await requireApiUserId();
  // Full exports are heavier: max 5 per minute.
  await enforceRateLimit(`export:user:${userId}`, { limit: 5, windowMs: 60_000 });
  const format = exportFormatSchema.parse(new URL(request.url).searchParams.get("format"));

  const conversations = await db.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true, attachments: true, createdAt: true },
      },
    },
  });

  const body =
    format === "md"
      ? buildMarkdownExport(conversations)
      : JSON.stringify(buildJsonExport(conversations), null, 2);
  return downloadResponse(body, exportFilename("all-chats", format), format);
});
