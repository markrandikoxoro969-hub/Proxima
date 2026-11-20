import { describe, expect, it } from "vitest";
import {
  ImageDataError,
  decodeBase64,
  encodeBase64,
  isLikelyImageDataUrl,
  parseImageDataUrl,
  sniffImageMime,
  toImageDataUrl,
} from "./data-url";
import { IMAGE_LIMITS } from "./limits";
import { readImageSize } from "./size";

/** A real 1×1 PNG. */
export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export const pngDataUrl = (base64 = TINY_PNG_BASE64, mime = "image/png") => `data:${mime};base64,${base64}`;

describe("base64 helpers", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    expect(Array.from(decodeBase64(encodeBase64(bytes)))).toEqual(Array.from(bytes));
  });
});

describe("sniffImageMime", () => {
  it("recognises PNG, JPEG, WebP and SVG", () => {
    expect(sniffImageMime(decodeBase64(TINY_PNG_BASE64))).toBe("image/png");
    expect(
      sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])),
    ).toBe("image/jpeg");
    const webp = new Uint8Array(20);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffImageMime(webp)).toBe("image/webp");
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(sniffImageMime(svg)).toBe("image/svg+xml");
  });

  it("rejects other files", () => {
    expect(sniffImageMime(new TextEncoder().encode("hello there, not a picture"))).toBeNull();
    expect(sniffImageMime(new Uint8Array([1, 2]))).toBeNull();
  });
});

describe("parseImageDataUrl", () => {
  it("returns the real type and bytes", () => {
    const parsed = parseImageDataUrl(pngDataUrl());
    expect(parsed.mime).toBe("image/png");
    expect(parsed.bytes.length).toBeGreaterThan(50);
    expect(parsed.base64).toBe(TINY_PNG_BASE64);
  });

  it("trusts the bytes, not the label", () => {
    const parsed = parseImageDataUrl(pngDataUrl(TINY_PNG_BASE64, "image/jpeg"));
    expect(parsed.mime).toBe("image/png");
  });

  it("explains what is wrong in plain words", () => {
    expect(() => parseImageDataUrl(undefined)).toThrow(/No image/);
    expect(() => parseImageDataUrl("hello")).toThrow(ImageDataError);
    expect(() => parseImageDataUrl("data:image/png;base64,!!!!")).toThrow(/doesn't look like an image/);
    expect(() => parseImageDataUrl("data:image/png;base64,AAAA")).toThrow(/PNG, JPEG or WebP/);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(() => parseImageDataUrl(toImageDataUrl("image/svg+xml", encodeBase64(svg)))).toThrow(/SVG/);
    expect(() => parseImageDataUrl(pngDataUrl(), { maxBytes: 10 })).toThrow(/too big/);
  });

  it("refuses oversized payloads before decoding", () => {
    const huge = `data:image/png;base64,${"A".repeat(IMAGE_LIMITS.dataUrlMax)}`;
    expect(() => parseImageDataUrl(huge)).toThrow(/too big/);
  });

  it("detects image data URLs for the composer", () => {
    expect(isLikelyImageDataUrl(pngDataUrl())).toBe(true);
    expect(isLikelyImageDataUrl("data:text/plain;base64,aaa")).toBe(false);
  });
});

describe("readImageSize", () => {
  it("reads the size of a PNG", () => {
    expect(readImageSize(decodeBase64(TINY_PNG_BASE64))).toEqual({ width: 1, height: 1 });
  });

  it("reads the size of a JPEG (SOF0)", () => {
    const bytes = new Uint8Array([
      0xff,
      0xd8, // SOI
      0xff,
      0xe0,
      0x00,
      0x04,
      0x00,
      0x00, // APP0 with a 4-byte segment
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      0x02,
      0x58,
      0x03,
      0x20,
      0x03,
      0x01,
      0x11,
      0x00,
      0x02,
      0x11,
      0x01,
      0x03,
      0x11,
      0x01,
    ]);
    expect(readImageSize(bytes)).toEqual({ width: 800, height: 600 });
  });

  it("reads the size of a WebP (VP8X)", () => {
    const bytes = new Uint8Array(30);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
    bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
    bytes.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
    // width = 1 + 1023, height = 1 + 767 (little-endian, 24-bit)
    bytes.set([0xff, 0x03, 0x00], 24);
    bytes.set([0xff, 0x02, 0x00], 27);
    expect(readImageSize(bytes)).toEqual({ width: 1024, height: 768 });
  });

  it("returns null for anything it can't read", () => {
    expect(readImageSize(new TextEncoder().encode("not an image at all, sorry"))).toBeNull();
  });
});
