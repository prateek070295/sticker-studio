/**
 * Self-contained client-side ZIP archive generator.
 * Stores files with standard PKZIP local and central directory headers.
 * PNG files are already zlib/DEFLATE compressed, so store-mode (method 0)
 * is lightning-fast, uses zero external dependencies, and is compatible with
 * all operating systems (Windows Explorer, macOS Finder, unzip CLI).
 */

// Precomputed CRC-32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const fileRecords: Array<{
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc: number;
    offset: number;
  }> = [];

  let currentOffset = 0;
  const localHeaderChunks: Uint8Array[] = [];

  // 1. Generate Local File Headers + Data
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const offset = currentOffset;

    fileRecords.push({
      nameBytes,
      data: entry.data,
      crc,
      offset
    });

    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);

    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true); // Version needed to extract (2.0)
    view.setUint16(6, 0x0800, true); // General purpose bit flag (UTF-8 filenames)
    view.setUint16(8, 0, true); // Compression method (0 = stored)
    view.setUint16(10, 0x4b21, true); // Last mod time (12:25)
    view.setUint16(12, 0x546b, true); // Last mod date (2022-03-11)
    view.setUint32(14, crc, true); // CRC-32
    view.setUint32(18, entry.data.length, true); // Compressed size
    view.setUint32(22, entry.data.length, true); // Uncompressed size
    view.setUint16(26, nameBytes.length, true); // File name length
    view.setUint16(28, 0, true); // Extra field length

    header.set(nameBytes, 30);

    localHeaderChunks.push(header);
    localHeaderChunks.push(entry.data);
    currentOffset += header.length + entry.data.length;
  }

  // 2. Generate Central Directory
  const centralDirOffset = currentOffset;
  const centralDirChunks: Uint8Array[] = [];
  let centralDirSize = 0;

  for (const record of fileRecords) {
    const header = new Uint8Array(46 + record.nameBytes.length);
    const view = new DataView(header.buffer);

    view.setUint32(0, 0x02014b50, true); // Central file header signature
    view.setUint16(4, 20, true); // Version made by
    view.setUint16(6, 20, true); // Version needed to extract
    view.setUint16(8, 0x0800, true); // UTF-8
    view.setUint16(10, 0, true); // Stored
    view.setUint16(12, 0x4b21, true); // Mod time
    view.setUint16(14, 0x546b, true); // Mod date
    view.setUint32(16, record.crc, true); // CRC-32
    view.setUint32(20, record.data.length, true); // Compressed size
    view.setUint32(24, record.data.length, true); // Uncompressed size
    view.setUint16(28, record.nameBytes.length, true); // Name length
    view.setUint16(30, 0, true); // Extra field length
    view.setUint16(32, 0, true); // Comment length
    view.setUint16(34, 0, true); // Disk number start
    view.setUint16(36, 0, true); // Internal attributes
    view.setUint32(38, 0, true); // External attributes
    view.setUint32(42, record.offset, true); // Relative offset of local header

    header.set(record.nameBytes, 46);
    centralDirChunks.push(header);
    centralDirSize += header.length;
  }

  // 3. End of Central Directory Record (EOCD)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true); // Number of this disk
  eocdView.setUint16(6, 0, true); // Disk where central directory starts
  eocdView.setUint16(8, fileRecords.length, true); // Number of central directory records on this disk
  eocdView.setUint16(10, fileRecords.length, true); // Total number of central directory records
  eocdView.setUint32(12, centralDirSize, true); // Size of central directory
  eocdView.setUint32(16, centralDirOffset, true); // Offset of start of central directory
  eocdView.setUint16(20, 0, true); // ZIP comment length

  const allChunks = [...localHeaderChunks, ...centralDirChunks, eocd];
  return new Blob(allChunks as BlobPart[], { type: 'application/zip' });
}
