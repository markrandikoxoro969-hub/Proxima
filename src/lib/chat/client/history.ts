import type { AttachmentMeta } from "@/lib/chat/types";

/** Temporary chats keep their recent turns and image IDs in the browser only. */
export function temporaryHistory(
  messages: { role: "user" | "assistant"; content: string; attachments: AttachmentMeta[] | null }[],
) {
  return messages.slice(-20).map((message) => {
    const images =
      message.role === "user"
        ? (message.attachments ?? []).flatMap((attachment) =>
            attachment.kind === "image" && attachment.imageId ? [{ id: attachment.imageId }] : [],
          )
        : [];
    return { role: message.role, content: message.content, ...(images.length ? { images } : {}) };
  });
}
