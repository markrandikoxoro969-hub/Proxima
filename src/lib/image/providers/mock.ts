import "server-only";
import { ImageProviderError, type GeneratedImage, type ImageProvider } from "../types";

/**
 * Offline image engine.
 *
 * It draws an SVG "preview card" from the prompt — no network, no API key, no
 * cost. That keeps the studio usable with AI_PROVIDER=mock (or on a laptop
 * without a key), and it gives the tests something deterministic to check.
 * The studio labels results from here as an offline preview, so nobody
 * mistakes it for a real model.
 */

const GRADIENTS: [string, string][] = [
  ["#1e1b4b", "#7c3aed"],
  ["#042f2e", "#14b8a6"],
  ["#431407", "#f97316"],
  ["#0c1a2b", "#3b82f6"],
  ["#2e1065", "#c084fc"],
  ["#052e16", "#22c55e"],
];

/** Stable, tiny hash so the same prompt always gets the same colours. */
function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i++) value = (value * 31 + text.charCodeAt(i)) >>> 0;
  return value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Splits a prompt into readable lines for the preview card. */
export function wrapPrompt(prompt: string, perLine = 34, maxLines = 3): string[] {
  const words = prompt.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > perLine && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines.map((l) => (l.length > perLine ? `${l.slice(0, perLine - 1)}…` : l));
}

function svgDocument(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

/** A gradient card with the prompt on it — clearly a placeholder, but pleasant. */
export function mockImageSvg(prompt: string, width: number, height: number): string {
  const [from, to] = GRADIENTS[hash(prompt) % GRADIENTS.length];
  const short = Math.min(width, height);
  const title = Math.max(16, Math.round(short / 18));
  const lines = wrapPrompt(prompt);
  const lineHeight = Math.round(title * 1.35);
  const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;

  const text = lines
    .map(
      (line, index) =>
        `<text x="${width / 2}" y="${Math.round(startY + index * lineHeight)}" fill="#ffffff" opacity="${
          index === 0 ? 0.95 : 0.7
        }" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${
          index === 0 ? title : Math.round(title * 0.8)
        }" font-weight="700" text-anchor="middle">${escapeXml(line)}</text>`,
    )
    .join("");

  return svgDocument(
    width,
    height,
    `<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <circle cx="${width / 2}" cy="${height * 0.42}" r="${short * 0.42}" fill="url(#glow)"/>
    ${text}
    <text x="${width / 2}" y="${height - Math.round(short * 0.06)}" fill="#ffffff" opacity="0.55"
      font-family="ui-monospace, monospace" font-size="${Math.max(10, Math.round(short / 48))}"
      text-anchor="middle">OFFLINE PREVIEW · ADD AN IMAGE KEY FOR REAL ART</text>`,
  );
}

/** Shows the original picture with the requested change written on it. */
export function mockEditSvg(
  prompt: string,
  width: number,
  height: number,
  dataUrl: string,
  strength: number,
): string {
  const lines = wrapPrompt(prompt, 44, 2);
  const size = Math.max(14, Math.round(Math.min(width, height) / 24));
  const saturation = (1 + strength).toFixed(2);
  const label = lines
    .map(
      (line, index) =>
        `<text x="${Math.round(width * 0.05)}" y="${Math.round(height - size * (lines.length - index + 0.8))}" fill="#ffffff"
          font-family="ui-sans-serif, system-ui, sans-serif" font-size="${size}" font-weight="700">${escapeXml(line)}</text>`,
    )
    .join("");

  return svgDocument(
    width,
    height,
    `<defs>
      <linearGradient id="shade" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#000000" stop-opacity="0.72"/>
        <stop offset="0.55" stop-color="#000000" stop-opacity="0.12"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <image href="${escapeXml(dataUrl)}" width="${width}" height="${height}"
      preserveAspectRatio="xMidYMid slice" style="filter:saturate(${saturation}) contrast(1.05)"/>
    <rect width="${width}" height="${height}" fill="url(#shade)"/>
    ${label}
    <text x="${Math.round(width * 0.05)}" y="${Math.round(height - size * 0.4)}" fill="#ffffff" opacity="0.6"
      font-family="ui-monospace, monospace" font-size="${Math.max(9, Math.round(size * 0.6))}">OFFLINE PREVIEW EDIT</text>`,
  );
}

const encodeSvg = (svg: string) => new TextEncoder().encode(svg);

export function createMockImageProvider(): ImageProvider {
  return {
    id: "mock",
    label: "Offline preview",
    supportsEdit: true,

    async generate({ prompt, width, height, signal }) {
      if (signal.aborted) throw new ImageProviderError("Request was cancelled", "aborted");
      if (!prompt.trim()) throw new ImageProviderError("No prompt", "bad_response");
      const svg = mockImageSvg(prompt, width, height);
      return { bytes: encodeSvg(svg), mime: "image/svg+xml", width, height } satisfies GeneratedImage;
    },

    async edit({ prompt, width, height, image, strength, signal }) {
      if (signal.aborted) throw new ImageProviderError("Request was cancelled", "aborted");
      const svg = mockEditSvg(prompt, width, height, image.dataUrl, strength);
      return { bytes: encodeSvg(svg), mime: "image/svg+xml", width, height };
    },
  };
}
