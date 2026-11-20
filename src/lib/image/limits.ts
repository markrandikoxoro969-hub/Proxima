/**
 * Image limits. Shared by the browser (friendly warnings before uploading) and
 * the server (hard rules). No dependencies, so importing this stays cheap.
 */
export const IMAGE_LIMITS = {
  /** Pictures allowed in one message (alongside text/code files). */
  perMessage: 4,
  /** Biggest file the browser will accept, before shrinking. */
  uploadBytesMax: 12 * 1024 * 1024, // 12 MB
  /** Longest edge after the browser shrinks a picture. */
  uploadEdgeMax: 1280,
  /** Decoded bytes accepted by the server (a shrunk picture is ~100–400 KB). */
  storedBytesMax: 4 * 1024 * 1024, // 4 MB
  /** Base64 length that fits `storedBytesMax` (4/3 of the bytes + header). */
  dataUrlMax: 5_700_000,
  /** Longest prompt for generating or editing an image. */
  promptMax: 1000,
  /** Widest / tallest image the AI may produce. */
  generatedEdgeMax: 1536,
  /** How many recent images the studio lists. */
  galleryMax: 24,
  /** How many images one account may keep. Older ones are deleted first. */
  perAccountMax: 120,
} as const;

/** Sizes offered in the studio (the AI still gets a prompt describing the shape). */
export const IMAGE_SIZES = [
  { id: "square", label: "Square", width: 1024, height: 1024, hint: "1:1" },
  { id: "landscape", label: "Wide", width: 1280, height: 720, hint: "16:9" },
  { id: "portrait", label: "Tall", width: 720, height: 1280, hint: "9:16" },
  { id: "classic", label: "Classic", width: 1024, height: 768, hint: "4:3" },
] as const;

export type ImageSizeId = (typeof IMAGE_SIZES)[number]["id"];

export const findImageSize = (id: string | null | undefined) =>
  IMAGE_SIZES.find((size) => size.id === id) ?? IMAGE_SIZES[0];

/** Styles added to the prompt. Kept short so the model's own creativity leads. */
export const IMAGE_STYLES = [
  { id: "photo", label: "Photo", suffix: "photorealistic, natural light, 35mm photograph" },
  { id: "art", label: "Digital art", suffix: "digital painting, rich colour, detailed" },
  { id: "3d", label: "3D", suffix: "3D render, soft studio lighting" },
  { id: "anime", label: "Anime", suffix: "anime illustration, clean line art" },
  { id: "minimal", label: "Minimal", suffix: "minimalist, flat design, lots of negative space" },
  { id: "cinematic", label: "Cinematic", suffix: "cinematic lighting, dramatic, wide shot" },
] as const;

export type ImageStyleId = (typeof IMAGE_STYLES)[number]["id"];

export const findImageStyle = (id: string | null | undefined) =>
  IMAGE_STYLES.find((style) => style.id === id) ?? null;

/** Builds the text actually sent to the image model. */
export function buildImagePrompt(prompt: string, styleId?: string | null): string {
  const clean = prompt.replace(/\s+/g, " ").trim().slice(0, IMAGE_LIMITS.promptMax);
  const style = findImageStyle(styleId);
  return style ? `${clean}. ${style.suffix}` : clean;
}
