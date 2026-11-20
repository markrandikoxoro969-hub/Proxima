/**
 * Creates the app icons (PNG) from simple SVG drawings.
 * Run again only if you change the logo:   node scripts/generate-icons.mjs
 *
 *  public/icons/icon-192.png, icon-512.png  → phone home screen / install (rounded)
 *  public/icons/maskable-512.png            → Android adaptive icon (full square, logo in the safe zone)
 *  src/app/apple-icon.png                   → iPhone "Add to Home Screen" (180×180)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

// The PROXIMA planet. `scale` shrinks it so it fits inside "safe zones".
const planet = (scale = 1) => `
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">
    <circle cx="32" cy="32" r="13" fill="#ffffff"/>
    <ellipse cx="32" cy="32" rx="24" ry="8" fill="none" stroke="#ffffff" stroke-width="3" transform="rotate(-20 32 32)"/>
    <ellipse cx="32" cy="32" rx="24" ry="8" fill="none" stroke="#050505" stroke-width="1.5" transform="rotate(-20 32 32)" stroke-dasharray="38 200" stroke-dashoffset="-2"/>
  </g>`;

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#050505"/>${planet(1)}</svg>`;
const square = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#050505"/>${planet(scale)}</svg>`;

const out = [
  ["public/icons/icon-192.png", rounded, 192],
  ["public/icons/icon-512.png", rounded, 512],
  ["public/icons/maskable-512.png", square(0.72), 512],
  ["src/app/apple-icon.png", square(0.82), 180],
];

mkdirSync("public/icons", { recursive: true });
for (const [file, svg, size] of out) {
  const png = await sharp(Buffer.from(svg), { density: 600 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(file, png);
  console.log(`✓ ${file} (${size}×${size}, ${(png.length / 1024).toFixed(1)} KB)`);
}
