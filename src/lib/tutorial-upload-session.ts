import "server-only";

import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { TUTORIAL_BUCKET } from "@/lib/tutorials";

/**
 * Resumable tutorial uploads, held in storage rather than on the server.
 *
 * Three limits shaped this. The host refuses raw request bodies over about
 * 2MB, refuses any body over roughly 47MB, and gives the server a 64MB
 * temporary disk. So a video is sent as small form-data parts, and each part
 * goes straight into the private tutorial bucket instead of the local disk,
 * which is what "no space left on device" was telling us.
 *
 * Keeping the session in the database means a resumed upload finds its parts
 * even when a different server instance answers the next request.
 */
export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
export const UPLOAD_PARALLEL_PARTS = 4;
export const UPLOAD_SESSION_TTL_HOURS = 8;
export const UPLOAD_PREFIX = "uploads";

const ID = /^[0-9a-f-]{36}$/i;

export type UploadSession = {
  id: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  owner: string;
  chunkSize: number;
  totalParts: number;
  createdAt: string;
};

type SessionRow = {
  id: string; owner: string; file_name: string; file_size: string | number;
  content_type: string; chunk_size: number; total_parts: number; created_at: string;
};

function mapped(row: SessionRow): UploadSession {
  return {
    id: row.id,
    owner: row.owner,
    fileName: row.file_name,
    fileSize: Number(row.file_size),
    contentType: row.content_type,
    chunkSize: Number(row.chunk_size),
    totalParts: Number(row.total_parts),
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bucket(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (getGlashDbAdmin() as any).storage.from(TUTORIAL_BUCKET);
}

function partPath(id: string, index: number) {
  return `${UPLOAD_PREFIX}/${id}/part-${String(index).padStart(6, "0")}`;
}

async function removeSessionFiles(id: string) {
  const storage = bucket();
  const listed = await storage.list(`${UPLOAD_PREFIX}/${id}`, { limit: 1000 }).catch(() => ({ data: [] }));
  const names = (listed?.data || []).map((item: { name: string }) => `${UPLOAD_PREFIX}/${id}/${item.name}`);
  if (names.length) await storage.remove(names).catch(() => undefined);
}

/** Clears uploads nobody came back for, so parts cannot pile up in storage. */
export async function pruneUploadSessions() {
  const stale = await glashQuery<{ id: string }>(
    `delete from public.tutorial_upload_sessions
      where created_at < now() - ($1 || ' hours')::interval
      returning id::text`,
    [String(UPLOAD_SESSION_TTL_HOURS)],
  ).catch(() => []);
  for (const row of stale) await removeSessionFiles(row.id);
  return stale.length;
}

/** One upload at a time per person: a retry replaces the abandoned attempt. */
export async function clearOwnerSessions(owner: string, keepId?: string) {
  const rows = await glashQuery<{ id: string }>(
    `delete from public.tutorial_upload_sessions
      where owner = $1 and ($2::uuid is null or id <> $2::uuid)
      returning id::text`,
    [owner, keepId || null],
  ).catch(() => []);
  for (const row of rows) await removeSessionFiles(row.id);
  return rows.length;
}

export async function beginUploadSession(input: { fileName: string; fileSize: number; contentType: string; owner: string }) {
  await pruneUploadSessions();
  await clearOwnerSessions(input.owner);
  const totalParts = Math.max(1, Math.ceil(input.fileSize / UPLOAD_CHUNK_BYTES));
  const row = await glashMaybeOne<SessionRow>(
    `insert into public.tutorial_upload_sessions
       (owner, file_name, file_size, content_type, chunk_size, total_parts)
     values ($1,$2,$3,$4,$5,$6)
     returning id::text, owner, file_name, file_size, content_type, chunk_size, total_parts, created_at::text`,
    [input.owner, input.fileName.slice(0, 180), input.fileSize, input.contentType || "video/mp4", UPLOAD_CHUNK_BYTES, totalParts],
  );
  if (!row) throw new Error("The upload could not be started.");
  return mapped(row);
}

async function sessionRow(id: string, owner: string) {
  if (!ID.test(id)) return null;
  const row = await glashMaybeOne<SessionRow>(
    `select id::text, owner, file_name, file_size, content_type, chunk_size, total_parts, created_at::text
       from public.tutorial_upload_sessions where id = $1::uuid and owner = $2`,
    [id, owner],
  );
  return row ? mapped(row) : null;
}

async function storedParts(id: string) {
  const listed = await bucket().list(`${UPLOAD_PREFIX}/${id}`, { limit: 1000 }).catch(() => ({ data: [] }));
  const parts: Array<{ index: number; size: number }> = [];
  for (const item of (listed?.data || []) as Array<{ name: string; metadata?: { size?: number } }>) {
    const index = Number(item.name.replace("part-", ""));
    if (!Number.isInteger(index)) continue;
    parts.push({ index, size: Number(item.metadata?.size || 0) });
  }
  return parts.sort((a, b) => a.index - b.index);
}

/** What the browser needs to carry on: which parts are already stored. */
export async function getUploadSession(id: string, owner: string) {
  const session = await sessionRow(id, owner);
  if (!session) return null;
  const parts = await storedParts(id);
  return {
    ...session,
    receivedIndexes: parts.map((part) => part.index),
    receivedBytes: parts.reduce((total, part) => total + part.size, 0),
  };
}

export async function storeUploadPart(id: string, owner: string, index: number, chunk: Buffer) {
  const session = await sessionRow(id, owner);
  if (!session) throw new Error("This upload is no longer available. Start it again.");
  if (!Number.isInteger(index) || index < 0 || index >= session.totalParts) {
    throw new Error("That part does not belong to this upload.");
  }
  const expected = index === session.totalParts - 1
    ? session.fileSize - session.chunkSize * index
    : session.chunkSize;
  if (chunk.byteLength !== expected) throw new Error("That part is not the size this upload expects.");

  // upsert: a retried part replaces the one already there rather than failing.
  const { error } = await bucket().upload(partPath(id, index), chunk, {
    contentType: "application/octet-stream",
    upsert: true,
  });
  if (error) throw new Error(error.message || "That part could not be stored.");

  await glashQuery(`update public.tutorial_upload_sessions set updated_at = now() where id = $1::uuid`, [id]).catch(() => []);
  const parts = await storedParts(id);
  return {
    receivedBytes: parts.reduce((total, part) => total + part.size, 0),
    receivedParts: parts.length,
    totalParts: session.totalParts,
  };
}

export async function readCompletedUpload(id: string, owner: string) {
  const session = await sessionRow(id, owner);
  if (!session) throw new Error("This upload is no longer available. Start it again.");
  const parts = await storedParts(id);
  if (parts.length !== session.totalParts) {
    throw new Error(`The upload is missing ${session.totalParts - parts.length} of its ${session.totalParts} parts.`);
  }
  const storage = bucket();
  const chunks: Buffer[] = [];
  for (let index = 0; index < session.totalParts; index += 1) {
    const downloaded = await storage.download(partPath(id, index));
    if (downloaded.error || !downloaded.data) throw new Error(`Part ${index + 1} could not be read back.`);
    chunks.push(Buffer.from(await downloaded.data.arrayBuffer()));
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.byteLength !== session.fileSize) throw new Error("The assembled video does not match the file that was chosen.");
  return { session, buffer };
}

export async function discardUploadSession(id: string, owner: string) {
  const session = await sessionRow(id, owner);
  if (!session) return false;
  await removeSessionFiles(id);
  await glashQuery(`delete from public.tutorial_upload_sessions where id = $1::uuid`, [id]).catch(() => []);
  return true;
}

/** What each held upload is using, for the storage health check. */
export async function listUploadSessions() {
  const rows = await glashQuery<SessionRow>(
    `select id::text, owner, file_name, file_size, content_type, chunk_size, total_parts, created_at::text
       from public.tutorial_upload_sessions order by created_at desc limit 20`,
  ).catch(() => []);
  const sessions = [];
  for (const row of rows) {
    const session = mapped(row);
    const parts = await storedParts(session.id);
    sessions.push({
      id: session.id.slice(0, 8),
      fileName: session.fileName,
      owner: session.owner,
      ageMinutes: Math.round((Date.now() - new Date(session.createdAt).getTime()) / 60000),
      bytes: parts.reduce((total, part) => total + part.size, 0),
      parts: `${parts.length} of ${session.totalParts}`,
    });
  }
  return sessions;
}
