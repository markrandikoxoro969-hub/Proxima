import "server-only";
import { db } from "@/lib/db";
import type { AttachmentMeta } from "@/lib/chat/types";
import { encodeBase64, toImageDataUrl } from "./data-url";
import { IMAGE_LIMITS } from "./limits";
import type { ImageDTO, ImageSource } from "./types";

/**
 * Saving, reading and trimming a person's images.
 *
 * The bytes live in Postgres (see the ImageAsset model), so there is nothing
 * else to configure. Every query here is scoped to the owner: another person's
 * image is indistinguishable from one that doesn't exist.
 */

export const imageUrl = (id: string) => `/api/images/${id}`;

type ImageRow = {
  id: string;
  mime: string;
  width: number;
  height: number;
  source: string;
  prompt: string | null;
  createdAt: Date;
};

export function toImageDTO(row: ImageRow): ImageDTO {
  return {
    id: row.id,
    url: imageUrl(row.id),
    mime: row.mime,
    width: row.width,
    height: row.height,
    source: (row.source as ImageSource) ?? "upload",
    prompt: row.prompt,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Keeps only the newest `perAccountMax` images for one person. */
export async function pruneImages(userId: string): Promise<void> {
  const old = await db.imageAsset.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: IMAGE_LIMITS.perAccountMax,
    select: { id: true },
  });
  if (old.length === 0) return;
  await db.imageAsset.deleteMany({ where: { id: { in: old.map((row) => row.id) } } });
}

export async function saveImage({
  userId,
  bytes,
  mime,
  width,
  height,
  source,
  prompt,
  parentId,
}: {
  userId: string;
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
  source: ImageSource;
  prompt?: string | null;
  parentId?: string | null;
}): Promise<ImageDTO> {
  // Copy into a fresh buffer: Prisma's Bytes input is Uint8Array<ArrayBuffer>.
  const data = new Uint8Array(bytes);
  const row = await db.imageAsset.create({
    data: {
      userId,
      bytes: data,
      mime,
      width,
      height,
      source,
      prompt: prompt ? prompt.slice(0, 1200) : null,
      parentId: parentId ?? null,
    },
    select: { id: true, mime: true, width: true, height: true, source: true, prompt: true, createdAt: true },
  });
  // Trim in the background: a failed cleanup must not fail the upload.
  void pruneImages(userId).catch(() => {});
  return toImageDTO(row);
}

export async function listImages(userId: string, limit = IMAGE_LIMITS.galleryMax): Promise<ImageDTO[]> {
  const rows = await db.imageAsset.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(limit, IMAGE_LIMITS.galleryMax),
    select: { id: true, mime: true, width: true, height: true, source: true, prompt: true, createdAt: true },
  });
  return rows.map(toImageDTO);
}

/** The image with its bytes, only if it belongs to this person. */
export async function loadOwnedImage(userId: string, id: string) {
  const row = await db.imageAsset.findFirst({ where: { id, userId } });
  return row;
}

export async function deleteOwnedImage(userId: string, id: string): Promise<boolean> {
  const { count } = await db.imageAsset.deleteMany({ where: { id, userId } });
  return count > 0;
}

/** What we store on a chat message for an attached picture (never the bytes). */
export function imageAttachmentMeta(row: ImageRow): AttachmentMeta {
  return {
    kind: "image",
    name: `image-${row.id.slice(-6)}.${row.mime.split("/")[1] ?? "png"}`,
    size: 0,
    language: "",
    url: imageUrl(row.id),
    imageId: row.id,
    width: row.width,
    height: row.height,
  };
}

/** Attachment info for a picture, from the data the chat already holds. */
export function chatImageAttachment(image: {
  id: string;
  mime: string;
  width: number;
  height: number;
}): AttachmentMeta {
  return {
    kind: "image",
    name: `image-${image.id.slice(-6)}.${image.mime.split("/")[1] ?? "png"}`,
    size: 0,
    language: "",
    url: imageUrl(image.id),
    imageId: image.id,
    width: image.width,
    height: image.height,
  };
}

export type ChatImage = {
  id: string;
  mime: string;
  width: number;
  height: number;
  dataUrl: string;
};

/** Loads the pictures a chat message refers to, ready to hand to the AI. */
export async function loadChatImages(userId: string, ids: string[]): Promise<ChatImage[]> {
  if (ids.length === 0) return [];
  const rows = await db.imageAsset.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true, mime: true, width: true, height: true, bytes: true },
  });
  // Keep the order the person attached them in.
  const byId = new Map(rows.map((row) => [row.id, row]));
  const out: ChatImage[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    const bytes = new Uint8Array(row.bytes);
    out.push({
      id: row.id,
      mime: row.mime,
      width: row.width,
      height: row.height,
      dataUrl: toImageDataUrl(row.mime, encodeBase64(bytes)),
    });
  }
  return out;
}
