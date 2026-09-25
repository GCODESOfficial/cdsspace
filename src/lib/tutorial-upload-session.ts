import "server-only";

import crypto from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Resumable tutorial uploads.
 *
 * A whole video in one request never arrived: the proxy in front of the app
 * refuses bodies over about 48MB, so a 100MB recording was rejected before a
 * single percent could be reported. The browser now sends small parts, which
 * pass comfortably, and this keeps the parts on disk until the video is whole.
 *
 * The session survives a closed tab or a dropped connection, so an admin can
 * come back, pick the same file, and carry on from where it stopped rather
 * than starting the upload again.
 */
export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
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
  receivedBytes: number;
};

function sessionDir(id: string) {
  if (!ID.test(id)) throw new Error("Invalid upload reference.");
  return path.join(ROOT, id);
}

async function readMeta(id: string): Promise<UploadSession | null> {
  try {
    return JSON.parse(await readFile(path.join(sessionDir(id), "meta.json"), "utf8")) as UploadSession;
  } catch {
    return null;
  }
}

async function writeMeta(session: UploadSession) {
  await writeFile(path.join(sessionDir(session.id), "meta.json"), JSON.stringify(session), "utf8");
}

/** Removes sessions nobody came back for, so an abandoned upload cannot fill the disk. */
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
    receivedBytes: 0,
  };
  await writeMeta(session);
  return session;
}

/** What the browser needs to know to carry on: how much is already here. */
export async function getUploadSession(id: string, owner: string) {
  const session = await readMeta(id);
  if (!session || session.owner !== owner) return null;
  try {
    session.receivedBytes = (await stat(path.join(sessionDir(id), "part"))).size;
  } catch {
    session.receivedBytes = 0;
  }
  return session;
}

/**
 * Appends one part. The offset the browser claims must match what is already
 * stored, so a retry of a part that already landed cannot corrupt the file.
 */
export async function appendUploadChunk(id: string, owner: string, offset: number, chunk: Buffer) {
  const session = await getUploadSession(id, owner);
  if (!session) throw new Error("This upload is no longer available. Start it again.");
  if (offset !== session.receivedBytes) {
    return { ...session, duplicate: true };
  }
  if (session.receivedBytes + chunk.byteLength > session.fileSize) {
    throw new Error("This part does not belong to the upload.");
  }
  await appendFile(path.join(sessionDir(id), "part"), chunk);
  session.receivedBytes += chunk.byteLength;
  await writeMeta(session);
  return { ...session, duplicate: false };
}

export async function readCompletedUpload(id: string, owner: string) {
  const session = await getUploadSession(id, owner);
  if (!session) throw new Error("This upload is no longer available. Start it again.");
  if (session.receivedBytes !== session.fileSize) {
    throw new Error("The upload is not complete yet.");
  }
  const buffer = await readFile(path.join(sessionDir(id), "part"));
  return { session, buffer };
}

export async function discardUploadSession(id: string, owner: string) {
  const session = await readMeta(id);
  if (!session || session.owner !== owner) return false;
  await rm(sessionDir(id), { recursive: true, force: true }).catch(() => undefined);
  return true;
}
