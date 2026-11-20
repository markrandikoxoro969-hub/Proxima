/**
 * Reading and writing image data URLs (`data:image/png;base64,…`).
 *
 * Used in the browser (previews while uploading) and on the server (uploads,
 * AI results). The declared MIME type is never trusted: the real type comes
 * from the file's first bytes, so a renamed file can't slip through.
 */
import { IMAGE_LIMITS } from "./limits";

/** Types we accept for uploads. SVG is deliberately NOT here (it can run scripts). */
export const UPLOADABLE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type UploadableImageMime = (typeof UPLOADABLE_IMAGE_TYPES)[number];

/** Types our own image engine may produce (SVG is the offline preview). */
export const GENERATED_IMAGE_TYPES = [...UPLOADABLE_IMAGE_TYPES, "image/svg+xml"] as const;

export const isUploadableImageMime = (value: unknown): value is UploadableImageMime =>
  typeof value === "string" && (UPLOADABLE_IMAGE_TYPES as readonly string[]).includes(value);

export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // SVG: starts with "<svg" or an XML declaration mentioning svg (our previews only).
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 256)).trimStart();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) {
    return "image/svg+xml";
  }
  return null;
}

export class ImageDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageDataError";
  }
}

export type ParsedImage = { mime: string; bytes: Uint8Array; base64: string };

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Decodes base64 without Buffer (works in the browser, Node and the edge). */
export function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const toImageDataUrl = (mime: string, base64: string) => `data:${mime};base64,${base64}`;

/**
 * Parses `data:image/…;base64,…`, checks the size and returns the REAL type.
 * Throws ImageDataError with a message we can show to the person.
 */
export function parseImageDataUrl(
  value: unknown,
  {
    maxBytes = IMAGE_LIMITS.storedBytesMax,
    allowSvg = false,
  }: { maxBytes?: number; allowSvg?: boolean } = {},
): ParsedImage {
  if (typeof value !== "string") throw new ImageDataError("No image was sent.");
  if (value.length > IMAGE_LIMITS.dataUrlMax) {
    throw new ImageDataError("That picture is too big. Try a smaller one.");
  }
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(value.trim());
  if (!match) throw new ImageDataError("That doesn't look like an image.");
  const [, declaredMime, base64] = match;
  if (!BASE64.test(base64)) throw new ImageDataError("That image is damaged. Try another one.");

  const bytes = decodeBase64(base64);
  if (bytes.length === 0) throw new ImageDataError("That image is empty.");
  if (bytes.length > maxBytes) throw new ImageDataError("That picture is too big. Try a smaller one.");

  const mime = sniffImageMime(bytes);
  if (!mime) throw new ImageDataError("Only PNG, JPEG or WebP pictures are supported.");
  if (mime === "image/svg+xml" && !allowSvg) {
    throw new ImageDataError("SVG files aren't accepted. Please use a PNG, JPEG or WebP.");
  }
  if (mime !== declaredMime.toLowerCase() && !(mime === "image/jpeg" && declaredMime === "image/jpg")) {
    // The file was renamed or mislabelled; use the truth.
    if (!allowSvg && mime === "image/svg+xml") {
      throw new ImageDataError("SVG files aren't accepted. Please use a PNG, JPEG or WebP.");
    }
  }
  return { mime, bytes, base64 };
}

/** True when this data URL is an image small enough to put in a request body. */
export function isLikelyImageDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" && value.startsWith("data:image/") && value.length <= IMAGE_LIMITS.dataUrlMax
  );
}
