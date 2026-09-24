import "server-only";

import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { supabaseAdmin } from "@/lib/supabase";
import { releaseClientStorageReservation, reserveClientStorage } from "@/lib/client-storage";
import { assertSafeUpload } from "@/lib/upload-security";

export const CDRIVE_BUCKET = "client-drives";
export const CDRIVE_MAX_FILE_BYTES = 100 * 1024 * 1024;

export type CDriveAccess = "view" | "edit";

export function cleanDriveName(value: unknown, fallback = "Project drive") {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 120) || fallback;
}

export function cleanFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._ ()-]/g, "_").replace(/\s+/g, " ").trim().slice(0, 180) || "file";
}

export async function getClientDriveAccess(driveId: string, clientUserId: string) {
  return glashMaybeOne<{ access_level: CDriveAccess; status: string }>(
    `select member.access_level, drive.status
       from public.client_drive_members member
       join public.client_drives drive on drive.id = member.drive_id
      where member.drive_id = $1::uuid and member.client_user_id = $2::uuid
      limit 1`,
    [driveId, clientUserId],
  );
}

export async function loadDriveContents(driveId: string) {
  const [folders, files, members] = await Promise.all([
    glashQuery(`select id, parent_id, name, created_by_kind, created_at
                  from public.client_drive_folders where drive_id = $1::uuid order by name`, [driveId]),
    glashQuery<{
      id: string; folder_id: string | null; file_name: string; storage_path: string;
      mime_type: string | null; file_size: string; uploaded_by_kind: string; created_at: string;
    }>(`select id, folder_id, file_name, storage_path, mime_type, file_size::text,
               uploaded_by_kind, created_at
          from public.client_drive_files where drive_id = $1::uuid order by created_at desc`, [driveId]),
    glashQuery(`select member.client_user_id, member.access_level, profile.full_name, profile.company_name, profile.email
                  from public.client_drive_members member
                  join public.profiles profile on profile.id = member.client_user_id
                 where member.drive_id = $1::uuid order by profile.full_name nulls last, profile.email`, [driveId]),
  ]);

  const storage = (supabaseAdmin as any)?.storage;
  const signedFiles = await Promise.all(files.map(async (file) => {
    const { data } = storage
      ? await storage.from(CDRIVE_BUCKET).createSignedUrl(file.storage_path, 60 * 15)
      : { data: null };
    return { ...file, url: data?.signedUrl || null };
  }));
  return { folders, files: signedFiles, members };
}

export async function uploadDriveFile(input: {
  driveId: string;
  folderId?: string | null;
  file: File;
  actorKind: "admin" | "client";
  actorId: string;
}) {
  if (!supabaseAdmin) throw new Error("File storage is unavailable.");
  if (!input.file.size || input.file.size > CDRIVE_MAX_FILE_BYTES) {
    throw new Error("Files must be between 1 byte and 100 MB.");
  }
  if (input.folderId) {
    const folder = await glashMaybeOne(`select id from public.client_drive_folders where id = $1::uuid and drive_id = $2::uuid`, [input.folderId, input.driveId]);
    if (!folder) throw new Error("Folder not found in this drive.");
  }

  const safe = await assertSafeUpload(input.file, {
    allow: ["image", "pdf", "office", "zip", "design"],
    maxBytes: CDRIVE_MAX_FILE_BYTES,
    imageMaxDimension: 16_000,
    imageMaxInputPixels: 160_000_000,
  });
  const safeName = cleanFileName(input.file.name);
  const storagePath = `${input.driveId}/${crypto.randomUUID()}-${safeName}`;
  const buffer = safe.buffer;
  const reservationId = input.actorKind === "client"
    ? await reserveClientStorage(input.actorId, buffer.byteLength)
    : null;
  try {
    const { error } = await (supabaseAdmin as any).storage.from(CDRIVE_BUCKET).upload(storagePath, buffer, {
      contentType: safe.contentType,
      upsert: false,
    });
    if (error) throw new Error(error.message || "Upload failed.");
    const [row] = await glashQuery(
      `insert into public.client_drive_files
         (drive_id, folder_id, file_name, storage_path, mime_type, file_size, uploaded_by_kind, uploaded_by_id)
       values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
       returning id, folder_id, file_name, mime_type, file_size::text, uploaded_by_kind, created_at`,
      [input.driveId, input.folderId || null, safeName, storagePath, safe.contentType, buffer.byteLength, input.actorKind, input.actorId],
    );
    return row;
  } catch (error) {
    await (supabaseAdmin as any).storage.from(CDRIVE_BUCKET).remove([storagePath]).catch(() => undefined);
    throw error;
  } finally {
    await releaseClientStorageReservation(reservationId).catch(() => undefined);
  }
}
