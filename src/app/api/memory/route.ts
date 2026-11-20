import { readJson, withApi } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/api/security";
import { requireApiUserId } from "@/lib/auth/api";
import { db } from "@/lib/db";
import { deleteAllMemories, listMemories, setMemoryEnabled } from "@/lib/memory/store";
import { memoryEnabledSchema } from "@/lib/validation";

/**
 * GET    /api/memory           → { enabled, consentAt, memories }
 * GET    /api/memory?format=json|md → the same list as a download
 * POST   /api/memory {enabled} → turn memory on (records consent) or off
 * DELETE /api/memory           → forget everything, permanently
 *
 * Memory is only ever written by the server while Memory is on; this endpoint
 * is the person's control over it (Settings → Memory, and the "Forget this"
 * action in chat).
 */
export const GET = withApi(async (request: Request) => {
  const userId = await requireApiUserId();
  const format = new URL(request.url).searchParams.get("format");
  const [memories, user] = await Promise.all([
    listMemories(userId),
    db.user.findUnique({ where: { id: userId }, select: { memoryEnabled: true, memoryConsentAt: true } }),
  ]);
  const enabled = Boolean(user?.memoryEnabled);

  if (format === "json" || format === "md") {
    const body =
      format === "json"
        ? JSON.stringify(
            {
              app: "PROXIMA",
              exportedAt: new Date().toISOString(),
              enabled,
              memories: memories.map((memory) => ({
                text: memory.text,
                category: memory.category,
                createdAt: memory.createdAt,
                expiresAt: memory.expiresAt,
              })),
            },
            null,
            2,
          )
        : [
            "# What PROXIMA remembers about you",
            "",
            `Exported ${new Date().toISOString().slice(0, 10)} · memory is ${enabled ? "on" : "off"}`,
            "",
            ...memories.map(
              (memory) =>
                `- ${memory.text} _(${memory.category}, added ${memory.createdAt.toISOString().slice(0, 10)})_`,
            ),
            "",
          ].join("\n");

    return new Response(body, {
      headers: {
        "content-type": format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="proxima-memory.${format}"`,
        "cache-control": "no-store",
      },
    });
  }

  return Response.json(
    { enabled, consentAt: user?.memoryConsentAt ?? null, memories },
    { headers: { "cache-control": "no-store" } },
  );
});

export const POST = withApi(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  const { enabled } = memoryEnabledSchema.parse(await readJson(request));
  const result = await setMemoryEnabled(userId, enabled);
  return Response.json({ enabled: result.memoryEnabled, consentAt: result.memoryConsentAt });
});

export const DELETE = withApi(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await requireApiUserId();
  const deleted = await deleteAllMemories(userId);
  return Response.json({ deleted, cleared: true });
});
