import { site } from "@/lib/site";

export type ExportMessage = {
  role: "user" | "assistant";
  content: string;
  attachments: unknown;
  createdAt: Date;
};
export type ExportConversation = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ExportMessage[];
};

export function conversationToJson(c: ExportConversation) {
  return {
    id: c.id,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    messages: c.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.attachments ? { attachments: m.attachments } : {}),
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export function buildJsonExport(conversations: ExportConversation[], now = new Date()) {
  return {
    app: site.name,
    version: site.version,
    exportedAt: now.toISOString(),
    conversations: conversations.map(conversationToJson),
  };
}

function attachmentLine(attachments: unknown): string {
  if (!Array.isArray(attachments) || attachments.length === 0) return "";
  const names = attachments
    .map((a) => (a && typeof a === "object" && "name" in a ? String((a as { name: unknown }).name) : null))
    .filter(Boolean);
  return names.length ? `\n\n📎 ${names.join(", ")}` : "";
}

export function conversationToMarkdown(c: ExportConversation): string {
  const lines = [
    `# ${c.title}`,
    "",
    `_Started ${c.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC_`,
    "",
  ];
  for (const m of c.messages) {
    const time = m.createdAt.toISOString().slice(11, 16);
    lines.push(
      `### ${m.role === "user" ? "🧑 You" : "🪐 Proxima"} · ${time}`,
      "",
      m.content + attachmentLine(m.attachments),
      "",
    );
  }
  return lines.join("\n");
}

export function buildMarkdownExport(conversations: ExportConversation[], now = new Date()): string {
  const header = `> Exported from **${site.name}** (${site.version}) on ${now.toISOString().slice(0, 10)}\n`;
  return [header, ...conversations.map(conversationToMarkdown)].join("\n---\n\n");
}

/** Safe file name like "proxima-python-script-2026-11-19.md". */
export function exportFilename(title: string, ext: "json" | "md", now = new Date()): string {
  const slug =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "chat";
  return `proxima-${slug}-${now.toISOString().slice(0, 10)}.${ext}`;
}

export function downloadResponse(body: string, filename: string, ext: "json" | "md"): Response {
  return new Response(body, {
    headers: {
      "Content-Type": ext === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
