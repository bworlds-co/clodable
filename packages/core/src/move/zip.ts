import { createReadStream, createWriteStream } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { crc32, createInflateRaw } from "node:zlib";

/**
 * Just enough of the zip format to take one file out of Lovable's export: the central directory
 * (zip64 too, as exports reach 5 GB), then a streamed, checked copy of the entry. No system tool,
 * so it works the same on every computer.
 */

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  crc: number;
  offset: number;
}

const END = 0x06054b50;
const END64_LOCATOR = 0x07064b50;
const END64 = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export async function zipEntries(path: string): Promise<ZipEntry[]> {
  const file = await open(path, "r");
  try {
    const { size } = await file.stat();
    // The end record sits in the last 22 bytes plus a comment of at most 64 KiB.
    const tailSize = Math.min(size, 22 + 65_535 + 20);
    const tail = Buffer.alloc(tailSize);
    await file.read(tail, 0, tailSize, size - tailSize);
    let end = -1;
    for (let i = tailSize - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === END) {
        end = i;
        break;
      }
    }
    if (end < 0) throw new Error("not a zip file");
    let count = tail.readUInt16LE(end + 10);
    let dirSize = tail.readUInt32LE(end + 12);
    let dirOffset = tail.readUInt32LE(end + 16);
    if (
      (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) &&
      end >= 20 &&
      tail.readUInt32LE(end - 20) === END64_LOCATOR
    ) {
      const at = Number(tail.readBigUInt64LE(end - 20 + 8));
      const record = Buffer.alloc(56);
      await file.read(record, 0, 56, at);
      if (record.readUInt32LE(0) !== END64) throw new Error("broken zip64 record");
      count = Number(record.readBigUInt64LE(32));
      dirSize = Number(record.readBigUInt64LE(40));
      dirOffset = Number(record.readBigUInt64LE(48));
    }
    if (dirSize > 64 * 1024 * 1024) throw new Error("zip directory too large");
    const dir = Buffer.alloc(dirSize);
    await file.read(dir, 0, dirSize, dirOffset);
    const entries: ZipEntry[] = [];
    let p = 0;
    for (let n = 0; n < count && p + 46 <= dir.length; n++) {
      if (dir.readUInt32LE(p) !== CENTRAL) throw new Error("broken zip directory");
      const method = dir.readUInt16LE(p + 10);
      const crc = dir.readUInt32LE(p + 16);
      let compressedSize = dir.readUInt32LE(p + 20);
      let entrySize = dir.readUInt32LE(p + 24);
      const nameLength = dir.readUInt16LE(p + 28);
      const extraLength = dir.readUInt16LE(p + 30);
      const commentLength = dir.readUInt16LE(p + 32);
      let offset = dir.readUInt32LE(p + 42);
      const name = dir.subarray(p + 46, p + 46 + nameLength).toString("utf8");
      // Zip64 sizes and offset, in that order, for the fields that overflowed.
      let x = p + 46 + nameLength;
      const extraEnd = x + extraLength;
      while (x + 4 <= extraEnd) {
        const id = dir.readUInt16LE(x);
        const length = dir.readUInt16LE(x + 2);
        if (id === 0x0001) {
          let q = x + 4;
          if (entrySize === 0xffffffff) {
            entrySize = Number(dir.readBigUInt64LE(q));
            q += 8;
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(dir.readBigUInt64LE(q));
            q += 8;
          }
          if (offset === 0xffffffff) offset = Number(dir.readBigUInt64LE(q));
        }
        x += 4 + length;
      }
      entries.push({ name, method, compressedSize, size: entrySize, crc, offset });
      p = extraEnd + commentLength;
    }
    return entries;
  } finally {
    await file.close();
  }
}

/** Copy one entry to `target`, checking its size and CRC; the file only appears once it's whole. */
export async function extractEntry(path: string, entry: ZipEntry, target: string): Promise<void> {
  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error(`unsupported compression (method ${entry.method})`);
  }
  const file = await open(path, "r");
  let start: number;
  try {
    const header = Buffer.alloc(30);
    await file.read(header, 0, 30, entry.offset);
    if (header.readUInt32LE(0) !== LOCAL) throw new Error("broken zip entry");
    start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  } finally {
    await file.close();
  }
  const partial = `${target}.part`;
  let crc = 0;
  let size = 0;
  const check = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      crc = crc32(chunk, crc);
      size += chunk.length;
      done(null, chunk);
    },
  });
  const source = createReadStream(path, {
    start,
    ...(entry.compressedSize > 0 ? { end: start + entry.compressedSize - 1 } : {}),
  });
  try {
    if (entry.method === 8) {
      await pipeline(
        source,
        createInflateRaw(),
        check,
        createWriteStream(partial, { mode: 0o600 }),
      );
    } else {
      await pipeline(source, check, createWriteStream(partial, { mode: 0o600 }));
    }
    if (size !== entry.size || crc >>> 0 !== entry.crc >>> 0) {
      throw new Error("the file inside the zip is damaged");
    }
    await rename(partial, target);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}
