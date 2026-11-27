/**
 * Lightweight, zero-dependency, standards-compliant PKZIP (Store / method 0)
 * archive generator for downloading Proxima's multi-file coding projects as `.zip`.
 *
 * Uses UTF-8 filename flags (bit 11 = 0x0800) and standard IEEE 802.3 CRC-32 so
 * every operating system (macOS, Windows, Linux, Android, iOS) extracts cleanly.
 */

import { sanitizeFilePath } from "./code-bundle";

export type ZipEntryInput = {
  path: string;
  content: string;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return { time: dosTime & 0xffff, date: dosDate & 0xffff };
}

/** Builds a valid binary `.zip` archive in memory from UTF-8 text files. */
export function buildZipArchive(entries: ZipEntryInput[], now: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);

  const normalized = entries
    .map((entry) => {
      const safePath = sanitizeFilePath(entry.path);
      if (!safePath) return null;
      return {
        nameBytes: encoder.encode(safePath),
        dataBytes: encoder.encode(entry.content),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  let localTotal = 0;
  let centralTotal = 0;
  for (const item of normalized) {
    localTotal += 30 + item.nameBytes.length + item.dataBytes.length;
    centralTotal += 46 + item.nameBytes.length;
  }

  const totalSize = localTotal + centralTotal + 22;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  const offsets: number[] = [];
  const crcs: number[] = [];
  let cursor = 0;

  // 1. Local file headers + file data
  for (const item of normalized) {
    const checksum = crc32(item.dataBytes);
    offsets.push(cursor);
    crcs.push(checksum);

    view.setUint32(cursor, 0x04034b50, true); // Local file header signature
    view.setUint16(cursor + 4, 20, true); // Version needed to extract (2.0)
    view.setUint16(cursor + 6, 0x0800, true); // General purpose flag: UTF-8
    view.setUint16(cursor + 8, 0, true); // Compression method: 0 (store)
    view.setUint16(cursor + 10, time, true);
    view.setUint16(cursor + 12, date, true);
    view.setUint32(cursor + 14, checksum, true);
    view.setUint32(cursor + 18, item.dataBytes.length, true); // Compressed size
    view.setUint32(cursor + 22, item.dataBytes.length, true); // Uncompressed size
    view.setUint16(cursor + 26, item.nameBytes.length, true);
    view.setUint16(cursor + 28, 0, true); // Extra field length
    cursor += 30;

    output.set(item.nameBytes, cursor);
    cursor += item.nameBytes.length;

    output.set(item.dataBytes, cursor);
    cursor += item.dataBytes.length;
  }

  // 2. Central directory records
  const centralOffset = cursor;
  for (let i = 0; i < normalized.length; i++) {
    const item = normalized[i]!;
    const checksum = crcs[i]!;
    const localOffset = offsets[i]!;

    view.setUint32(cursor, 0x02014b50, true); // Central directory file header signature
    view.setUint16(cursor + 4, 20, true); // Version made by
    view.setUint16(cursor + 6, 20, true); // Version needed
    view.setUint16(cursor + 8, 0x0800, true); // UTF-8 flag
    view.setUint16(cursor + 10, 0, true); // Store
    view.setUint16(cursor + 12, time, true);
    view.setUint16(cursor + 14, date, true);
    view.setUint32(cursor + 16, checksum, true);
    view.setUint32(cursor + 20, item.dataBytes.length, true);
    view.setUint32(cursor + 24, item.dataBytes.length, true);
    view.setUint16(cursor + 28, item.nameBytes.length, true);
    view.setUint16(cursor + 30, 0, true); // Extra length
    view.setUint16(cursor + 32, 0, true); // Comment length
    view.setUint16(cursor + 34, 0, true); // Disk number
    view.setUint16(cursor + 36, 0, true); // Internal attrs
    view.setUint32(cursor + 38, 0, true); // External attrs
    view.setUint32(cursor + 42, localOffset, true);
    cursor += 46;

    output.set(item.nameBytes, cursor);
    cursor += item.nameBytes.length;
  }

  // 3. End of Central Directory (EOCD) record
  view.setUint32(cursor, 0x06054b50, true);
  view.setUint16(cursor + 4, 0, true); // Disk number
  view.setUint16(cursor + 6, 0, true); // Start disk
  view.setUint16(cursor + 8, normalized.length, true); // Entries on disk
  view.setUint16(cursor + 10, normalized.length, true); // Total entries
  view.setUint32(cursor + 12, centralTotal, true); // Central directory size
  view.setUint32(cursor + 16, centralOffset, true); // Central directory offset
  view.setUint16(cursor + 20, 0, true); // Comment length

  return output;
}

/** Builds a `.zip` Blob and triggers an immediate browser download. */
export function downloadFilesAsZip(entries: ZipEntryInput[], archiveName = "proxima-project.zip"): void {
  const bytes = buildZipArchive(entries);
  const safeName = archiveName.endsWith(".zip") ? archiveName : `${archiveName}.zip`;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
