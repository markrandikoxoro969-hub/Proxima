import { IMAGE_LIMITS } from "@/lib/image/limits";
import { api } from "./api";

/**
 * Pictures in the chat composer.
 *
 * Picking a photo never sends the file as-is: the browser shrinks it to at
 * most 1280 px and re-encodes it as JPEG. A 6 MB phone photo becomes a few
 * hundred KB, which makes uploading practical — and JPEG is on the documented
 * input list of every vision model we use. (Canvas WebP is smaller, but some
 * NVIDIA image endpoints only list PNG/JPEG, so the chat never depends on it.)
 */

export type DraftImage = {
  /** Stable key for React while the picture uploads. */
  key: string;
  name: string;
  size: number;
  width: number;
  height: number;
  /** `/api/images/<id>` when ready — safe to show in an <img>. */
  url: string;
  imageId?: string;
  status: "uploading" | "ready" | "error";
};

const MB = 1024 * 1024;

/** Friendly message when a file can't be used, or null when it can. Pure → testable. */
export function imageFileProblem(file: Pick<File, "type" | "size" | "name">): string | null {
  const type = (file.type || "").toLowerCase();
  const looksLikeImage = type.startsWith("image/");
  if (!looksLikeImage) {
    // Some phones leave the type empty for .heic/.jpg — fall back to the name.
    if (!/\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)) return "isn't a picture (PNG, JPEG, WebP or HEIC)";
  }
  if (type === "image/svg+xml") return "is an SVG, which isn't safe to upload";
  if (/\.gif$/i.test(file.name) || type === "image/gif")
    return "is a GIF — take a still picture or convert it first";
  if (file.size > IMAGE_LIMITS.uploadBytesMax) {
    return `is ${(file.size / MB).toFixed(1)} MB (max ${IMAGE_LIMITS.uploadBytesMax / MB} MB)`;
  }
  if (file.size === 0) return "is empty";
  return null;
}

type Loaded = {
  width: number;
  height: number;
  draw: (context: CanvasRenderingContext2D, w: number, h: number) => void;
};

async function loadImage(file: File | Blob): Promise<Loaded> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (context, w, h) => context.drawImage(bitmap, 0, 0, w, h),
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("That picture couldn't be opened."));
      element.src = url;
    });
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: (context, w, h) => context.drawImage(image, 0, 0, w, h),
    };
  } finally {
    // Revoke after the draw calls have had a chance to run.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/**
 * Shrinks a picture for upload. Returns a data URL small enough for the
 * server (under 4 MB decoded) and its real size.
 */
export async function shrinkImageFile(
  file: File,
  /** Chat sends JPEG (the vision endpoints document it); the studio keeps WebP. */
  format: "jpeg" | "webp" = "jpeg",
): Promise<{ dataUrl: string; width: number; height: number; bytes: number }> {
  const source = await loadImage(file);
  const scale = Math.min(1, IMAGE_LIMITS.uploadEdgeMax / Math.max(source.width, source.height));
  const widths = [Math.round(source.width * scale), 960, 768, 640, 512];
  // Start high: words in screenshots must stay sharp enough for the vision model.
  const qualities = [0.92, 0.82, 0.7];

  let best = { dataUrl: "", width: 0, height: 0, bytes: 0 };
  for (const targetWidth of widths) {
    const width = Math.max(1, Math.min(source.width, targetWidth));
    const height = Math.max(1, Math.round((source.height / source.width) * width));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser couldn't prepare that picture.");
    context.imageSmoothingQuality = "high";
    if (format === "jpeg") {
      // JPEG has no alpha; white is safer than the canvas's transparent black.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    source.draw(context, width, height);

    for (const quality of qualities) {
      const dataUrl = canvas.toDataURL(format === "webp" ? "image/webp" : "image/jpeg", quality);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const bytes = Math.floor((base64.length * 3) / 4);
      best = { dataUrl, width, height, bytes };
      if (bytes <= IMAGE_LIMITS.storedBytesMax / 2) return best;
    }
  }
  if (best.bytes > IMAGE_LIMITS.storedBytesMax)
    throw new Error("That picture stays too big. Try a smaller one.");
  return best;
}

/** Shrinks, then uploads. Throws a friendly Error on failure. */
export async function uploadDraftImage(file: File): Promise<DraftImage> {
  const problem = imageFileProblem(file);
  if (problem) throw new Error(`${file.name} ${problem}.`);

  const shrunk = await shrinkImageFile(file);
  const { image } = await api.uploadImage(shrunk.dataUrl, file.name);
  return {
    key: `${image.id}-${Math.random().toString(36).slice(2, 6)}`,
    name: file.name.slice(0, 60),
    size: shrunk.bytes,
    width: image.width,
    height: image.height,
    url: image.url,
    imageId: image.id,
    status: "ready",
  };
}

/** A picture the person already made in the studio, ready to attach. */
export function draftFromImage(image: {
  id: string;
  url: string;
  width: number;
  height: number;
  prompt?: string | null;
}): DraftImage {
  return {
    key: `${image.id}-${Math.random().toString(36).slice(2, 6)}`,
    name: (image.prompt ?? "AI image").slice(0, 60),
    size: 0,
    width: image.width,
    height: image.height,
    url: image.url,
    imageId: image.id,
    status: "ready",
  };
}

export const formatImageSize = (bytes: number) =>
  bytes <= 0
    ? "AI"
    : bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / MB).toFixed(1)} MB`;
