/**
 * Reads the real pixel size out of an image's header.
 *
 * We need the size to reserve the right space in the chat (no layout jump) and
 * to tell the image model the shape of an edited picture. It comes from the
 * bytes, never from the browser, so a request can't claim a wrong size.
 *
 * Supports PNG, JPEG and WebP — the three types uploads accept.
 */

export type ImageSize = { width: number; height: number };

const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const be32 = (b: Uint8Array, i: number) =>
  ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

/** Guards against a corrupt header claiming a 90000×90000 image. */
const sane = (width: number, height: number): ImageSize | null =>
  width >= 1 && height >= 1 && width <= 30_000 && height <= 30_000 ? { width, height } : null;

function pngSize(b: Uint8Array): ImageSize | null {
  if (b.length < 24) return null;
  return sane(be32(b, 16), be32(b, 20));
}

function jpegSize(b: Uint8Array): ImageSize | null {
  let i = 2; // skip SOI (FF D8)
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan
    const length = be16(b, i + 2);
    if (length < 2) return null;
    // SOF0…SOF15 (except DHT=C4, JPG=C8, DAC=CC) hold the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return sane(be16(b, i + 7), be16(b, i + 5));
    }
    i += 2 + length;
  }
  return null;
}

function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null;
  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);

  if (chunk === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return sane(le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff);
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const b1 = b[21];
    const b2 = b[22];
    const b3 = b[23];
    const b4 = b[24];
    const width = 1 + (((b2 & 0x3f) << 8) | b1);
    const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
    return sane(width, height);
  }
  if (chunk === "VP8X") {
    return sane(1 + le24(b, 24), 1 + le24(b, 27));
  }
  return null;
}

/** The pixel size of a PNG / JPEG / WebP image, or null when it can't be read. */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 24) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return pngSize(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return jpegSize(bytes);
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
    return webpSize(bytes);
  }
  return null;
}
