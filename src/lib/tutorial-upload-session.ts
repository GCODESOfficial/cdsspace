import "server-only";

import crypto from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Resumable tutorial uploads, sent as numbered parts.
 *
 * Two limits shape this. The host refuses raw bodies over about 2MB, and
 * refuses any body over roughly 47MB, so a whole video in one request never
 * arrived and raw parts were rejected as well. Parts are therefore sent as
 * form data, a few megabytes each, and several can be in flight at once.
 *
 * Each part is stored under its own index rather than appended, which is what
 * lets them arrive in any order, be retried individually, and be resumed after
 * a dropped connection or a closed tab.
 */
export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
export const UPLOAD_PARALLEL_PARTS = 4;
export const UPLOAD_SESSION_TTL_MS = 48 * 60 * 60 * 1000;

const ROOT = path.join(os.tmpdir(), "cds-tutorial-uploads");
const ID = /^[0-9a-f-]{36}$/i;

export type UploadSession = {
  id: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  owner: string;
  createdAt: number;
  chunkSize: number;
  totalParts: number;
};

function sessionDir(id: string) {
  if (!ID.test(id)) throw new Error("Invalid upload reference.");
  return path.join(ROOT, id);
}

function partName(index: number) {
  return `part-${String(index).padStart(6, "0")}`;
}

async function readMeta(id: string): Promise<UploadSession | null> {
  try {
    return JSON.parse(await readFile(path.join(sessionDir(id), "meta.json"), "utf8")) as UploadSession;
  } catch {
    return null;
  }
}

/** Removes sessions nobody came back for, so abandoned uploads cannot fill the disk. */
export async function pruneUploadSessions() {
  try {
    const entries = await readdir(ROOT, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isDirectory()) return;
      const meta = await readMeta(entry.name);
      const age = meta ? Date.now() - meta.createdAt : UPLOAD_SESSION_TTL_MS + 1;
      if (age > UPLOAD_SESSION_TTL_MS) await rm(path.join(ROOT, entry.name), { recursive: true, force: true }).catch(() => undefined);
    }));
  } catch {
    // No upload directory yet is not a problem.
  }
}

export async function beginUploadSession(input: { fileName: string; fileSize: number; contentType: string; owner: string }) {
  await pruneUploadSessions();
  const id = crypto.randomUUID();
  await mkdir(sessionDir(id), { recursive: true });
  const session: UploadSession = {
    id,
    fileName: input.fileName.slice(0, 180),
    fileSize: input.fileSize,
    contentType: input.contentType || "video/mp4",
    owner: input.owner,
    createdAt: Date.now(),
    chunkSize: UPLOAD_CHUNK_BYTES,
    totalParts: Math.max(1, Math.ceil(input.fileSize / UPLOAD_CHUNK_BYTES)),
  };
  await writeFile(path.join(sessionDir(id), "meta.json"), JSON.stringify(session), "utf8");
  return session;
}

async function receivedParts(id: string) {
  try {
    const entries = await readdir(sessionDir(id));
    const parts: Array<{ index: number; size: number }> = [];
    for (const entry of entries) {
      if (!entry.startsWith("part-")) continue;
      const index = Number(entry.slice(5));
      if (!Number.isInteger(index)) continue;
      parts.push({ index, size: (await stat(path.join(sessionDir(id), entry))).size });
    }
    return parts.sort((a, b) => a.index - b.index);
  } catch {
    return [];
  }
}

/** What the browser needs to carry on: which parts are already here. */
export async function getUploadSession(id: string, owner: string) {
  const session = await readMeta(id);
  if (!session || session.owner !== owner) return null;
  const parts = await receivedParts(id);
  return {
    ...session,
    receivedIndexes: parts.map((part) => part.index),
    receivedBytes: parts.reduce((total, part) => total + part.size, 0),
  };
}

/**
 * Stores one part. Written to a temporary name first, so a part interrupted
 * half way cannot be mistaken for a complete one when the upload resumes.
 */
export async function storeUploadPart(id: string, owner: string, index: number, chunk: Buffer) {
  const session = await readMeta(id);
  if (!session || session.owner !== owner) throw new Error("This upload is no longer available. Start it again.");
  if (!Number.isInteger(index) || index < 0 || index >= session.totalParts) throw new Error("That part does not belong to this upload.");

  const expected = index === session.totalParts - 1
    ? session.fileSize - session.chunkSize * index
    : session.chunkSize;
  if (chunk.byteLength !== expected) throw new Error("That part is not the size this upload expects.");

  const target = path.join(sessionDir(id), partName(index));
  const staging = `${target}.incoming-${crypto.randomUUID().slice(0, 8)}`;
  await writeFile(staging, chunk);
  await rename(staging, target);

  const parts = await receivedParts(id);
  return {
    receivedBytes: parts.reduce((total, part) => total + part.size, 0),
    receivedParts: parts.length,
    totalParts: session.totalParts,
  };
}

export async function readCompletedUpload(id: string, owner: string) {
  const session = await readMeta(id);
  if (!session || session.owner !== owner) throw new Error("This upload is no longer available. Start it again.");
  const parts = await receivedParts(id);
  if (parts.length !== session.totalParts) {
    throw new Error(`The upload is missing ${session.totalParts - parts.length} of its ${session.totalParts} parts.`);
  }
  const chunks: Buffer[] = [];
  for (let index = 0; index < session.totalParts; index += 1) {
    chunks.push(await readFile(path.join(sessionDir(id), partName(index))));
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.byteLength !== session.fileSize) throw new Error("The assembled video does not match the file that was chosen.");
  return { session, buffer };
}

export async function discardUploadSession(id: string, owner: string) {
  const session = await readMeta(id);
  if (!session || session.owner !== owner) return false;
  await rm(sessionDir(id), { recursive: true, force: true }).catch(() => undefined);
  return true;
}
