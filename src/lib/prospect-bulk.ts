import "server-only";

import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Bulk company registers: the large CSV and ZIP dumps that most national
 * registries publish instead of a paged API.
 *
 * Both shapes are read by byte offset rather than row number, so a run stores
 * where it stopped and the next one resumes from exactly that point. A remote
 * CSV is sliced with HTTP range requests; an archive is fetched once, expanded
 * into the temp directory, and sliced from there.
 */

const USER_AGENT = `CDSSpace-MarketResearch/1.0 (+https://cdsspace.pro${process.env.RESEARCH_CONTACT_EMAIL ? `; ${process.env.RESEARCH_CONTACT_EMAIL}` : ""})`;

/** How much of a bulk file one slice reads. Roughly 12,000 to 20,000 rows. */
export const BULK_SLICE_BYTES = 4 * 1024 * 1024;

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface BulkSlice {
  header: string[];
  rows: string[][];
  nextOffset: number | null;
  totalBytes: number;
}

// ZIP reading ---------------------------------------------------------------

function findEndOfCentralDirectory(buffer: Buffer) {
  // The record sits at the end, after a comment of at most 65,535 bytes.
  const start = Math.max(0, buffer.length - 66_000);
  for (let index = buffer.length - 22; index >= start; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error("The archive has no readable directory record.");
}

/**
 * Extracts the first (or named) entry of a ZIP without a dependency. Registers
 * publish single-entry archives, which is the case this covers.
 */
export function readZipEntry(buffer: Buffer, preferName?: string): { name: string; data: Buffer } {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);

  let chosen: { name: string; method: number; compressedSize: number; localOffset: number } | null = null;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString("utf8", pointer + 46, pointer + 46 + nameLength);
    const wanted = preferName ? name.endsWith(preferName) : /\.(csv|txt|json|tsv)$/i.test(name);
    if (wanted && !chosen) chosen = { name, method, compressedSize, localOffset };
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  if (!chosen) throw new Error("The archive holds no CSV, TSV, TXT or JSON entry.");

  if (buffer.readUInt32LE(chosen.localOffset) !== 0x04034b50) throw new Error("The archive entry header is malformed.");
  const localNameLength = buffer.readUInt16LE(chosen.localOffset + 26);
  const localExtraLength = buffer.readUInt16LE(chosen.localOffset + 28);
  const dataStart = chosen.localOffset + 30 + localNameLength + localExtraLength;
  const compressed = buffer.subarray(dataStart, dataStart + chosen.compressedSize);

  if (chosen.method === 0) return { name: chosen.name, data: Buffer.from(compressed) };
  if (chosen.method === 8) return { name: chosen.name, data: inflateRawSync(compressed) };
  throw new Error(`The archive uses compression method ${chosen.method}, which is not supported.`);
}

// Caching -------------------------------------------------------------------

function cachePathFor(url: string) {
  const key = createHash("sha256").update(url).digest("hex").slice(0, 32);
  return join(tmpdir(), "cdsspace-prospect-bulk", `${key}.csv`);
}

async function isFresh(path: string) {
  try {
    const info = await stat(path);
    return info.size > 0 && Date.now() - info.mtimeMs < CACHE_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/**
 * Downloads an archive once and keeps the expanded file in the temp directory so
 * later slices do not re-download it. A cold instance simply fetches it again.
 */
export async function cachedArchiveCsv(url: string, entryName?: string) {
  const path = cachePathFor(url);
  if (await isFresh(path)) return path;

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`The bulk file responded ${response.status}.`);
  const archive = Buffer.from(await response.arrayBuffer());
  const entry = /\.zip($|\?)/i.test(url) ? readZipEntry(archive, entryName) : { name: url, data: archive };

  await mkdir(join(tmpdir(), "cdsspace-prospect-bulk"), { recursive: true });
  await writeFile(path, entry.data);
  return path;
}

// Slicing -------------------------------------------------------------------

/** Splits one delimited line, honouring doubled quotes inside quoted fields. */
export function splitDelimited(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') { current += '"'; index += 1; }
        else quoted = false;
      } else current += character;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === delimiter) { cells.push(current); current = ""; continue; }
    current += character;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseSlice(text: string, delimiter: string, header: string[] | null, atStart: boolean, atEnd: boolean) {
  const lines = text.split(/\r?\n/);
  // A slice that does not reach the end of the file stops mid-row, so the last
  // partial line is dropped and the next slice starts from where it began.
  let trailingBytes = 0;
  if (!atEnd && lines.length > 1) {
    const partial = lines.pop() || "";
    trailingBytes = Buffer.byteLength(partial, "utf8");
  }
  let resolvedHeader = header;
  if (atStart) {
    const first = lines.shift() || "";
    resolvedHeader = splitDelimited(first.replace(/^﻿/, ""), delimiter);
  }
  const rows = lines.filter((line) => line.trim()).map((line) => splitDelimited(line, delimiter));
  return { header: resolvedHeader || [], rows, trailingBytes };
}

/** Reads a slice of a remote CSV with a range request. */
export async function readRemoteCsvSlice(url: string, offset: number, header: string[] | null, delimiter = ";"): Promise<BulkSlice> {
  const end = offset + BULK_SLICE_BYTES - 1;
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Range: `bytes=${offset}-${end}` },
    signal: AbortSignal.timeout(120_000),
  });
  if (response.status !== 206 && response.status !== 200) throw new Error(`The bulk file responded ${response.status}.`);
  const contentRange = response.headers.get("content-range") || "";
  const totalBytes = Number(contentRange.split("/")[1] || response.headers.get("content-length") || 0);
  const buffer = Buffer.from(await response.arrayBuffer());
  const atEnd = totalBytes > 0 ? offset + buffer.length >= totalBytes : buffer.length < BULK_SLICE_BYTES;

  const parsed = parseSlice(buffer.toString("utf8"), delimiter, header, offset === 0, atEnd);
  const consumed = buffer.length - parsed.trailingBytes;
  return {
    header: parsed.header,
    rows: parsed.rows,
    nextOffset: atEnd || consumed <= 0 ? null : offset + consumed,
    totalBytes,
  };
}

/** Reads a slice of a file already expanded into the temp directory. */
export async function readLocalCsvSlice(path: string, offset: number, header: string[] | null, delimiter = ";"): Promise<BulkSlice> {
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    const length = Math.min(BULK_SLICE_BYTES, Math.max(0, info.size - offset));
    if (length <= 0) return { header: header || [], rows: [], nextOffset: null, totalBytes: info.size };
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, offset);
    const atEnd = offset + length >= info.size;

    const parsed = parseSlice(buffer.toString("utf8"), delimiter, header, offset === 0, atEnd);
    const consumed = buffer.length - parsed.trailingBytes;
    return {
      header: parsed.header,
      rows: parsed.rows,
      nextOffset: atEnd || consumed <= 0 ? null : offset + consumed,
      totalBytes: info.size,
    };
  } finally {
    await handle.close();
  }
}

/**
 * Reads a slice of a cached text file as raw lines. Fixed-width government
 * indexes are not delimited, so they are parsed by the adapter that knows their
 * column positions rather than here.
 */
export async function readLocalLineSlice(path: string, offset: number): Promise<{ lines: string[]; nextOffset: number | null; totalBytes: number }> {
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    const length = Math.min(BULK_SLICE_BYTES, Math.max(0, info.size - offset));
    if (length <= 0) return { lines: [], nextOffset: null, totalBytes: info.size };
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, offset);
    const atEnd = offset + length >= info.size;

    const text = buffer.toString("utf8");
    const lines = text.split(/\r?\n/);
    let trailing = 0;
    if (!atEnd && lines.length > 1) {
      const partial = lines.pop() || "";
      trailing = Buffer.byteLength(partial, "utf8");
    }
    const consumed = buffer.length - trailing;
    return {
      lines: lines.filter((line) => line.trim()),
      nextOffset: atEnd || consumed <= 0 ? null : offset + consumed,
      totalBytes: info.size,
    };
  } finally {
    await handle.close();
  }
}

/**
 * Finds the byte offset of the first line starting with `prefix`. Government
 * indexes are sorted, so jumping straight to the section that matters avoids
 * slicing through tens of megabytes of unrelated rows.
 */
export async function findLineOffset(path: string, prefix: string) {
  const buffer = await readFile(path);
  const index = buffer.indexOf(`\n${prefix}`);
  return index < 0 ? null : index + 1;
}

/** Maps a parsed row onto its header so adapters read by column name. */
export function rowReader(header: string[], row: string[]) {
  const index = new Map(header.map((name, position) => [name.trim().toLowerCase(), position]));
  return (column: string) => {
    const position = index.get(column.toLowerCase());
    return position === undefined ? "" : (row[position] || "").trim();
  };
}
