import { z } from "zod";
import { apiErrors, withApi } from "@/lib/api/http";
import { requireApiUserId } from "@/lib/auth/api";
import { buildJsonExport, buildMarkdownExport, downloadResponse, exportFilename } from "@/lib/chat/export";
import { db } from "@/lib/db";
import { exportFormatSchema } from "@/lib/validation";

/** GET /api/sessions/:id/export?format=json|md — download one chat. */
type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi(async (request: Request, ctx: Ctx) => {
  const userId = await requireApiUserId();
  const id = z.cuid().safeParse((await ctx.params).id);
  if (!id.success) throw apiErrors.notFound("Conversation not found");
  const format = exportFormatSchema.parse(new URL(request.url).searchParams.get("format"));

  const conversation = await db.conversation.findFirst({
    where: { id: id.data, userId },
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
  if (!conversation) throw apiErrors.notFound("Conversation not found");

  const body =
    format === "md"
      ? buildMarkdownExport([conversation])
      : JSON.stringify(buildJsonExport([conversation]), null, 2);
  return downloadResponse(body, exportFilename(conversation.title, format), format);
});
