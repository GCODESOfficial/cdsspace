import "server-only";

import { randomUUID } from "node:crypto";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";
import type { HrRecordStatus, HrRecordType } from "@/lib/hr-personnel";

export const HR_PERSONNEL_BUCKET = "hr-personnel";

function safeFileName(name: string) {
  return name.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "HR document";
}

export async function uploadHrPersonnelRecord(input: {
  file: File;
  teamMemberId: string;
  recordType: HrRecordType;
  title: string;
  summary: string;
  status: HrRecordStatus;
  eventDate: string;
  effectiveDate: string | null;
  dueAt: string | null;
  signedAt: string | null;
  actor: string;
}) {
  const safe = await assertSafeUpload(input.file, {
    allow: ["pdf", "office", "image"],
    maxBytes: 25 * 1024 * 1024,
    imageMaxDimension: 12000,
  });
  const storagePath = `members/${input.teamMemberId}/${randomUUID()}.${safe.ext}`;
  const storage = getGlashDbAdmin() as any;
  const { error: uploadError } = await storage.storage.from(HR_PERSONNEL_BUCKET).upload(storagePath, safe.buffer, {
    contentType: safe.contentType,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  try {
    const row = await glashMaybeOne<Record<string, unknown>>(
      `with inserted as (
         insert into public.hr_personnel_records
           (team_member_id, record_type, title, summary, status, event_date, effective_date,
            due_at, signed_at, storage_path, file_name, mime_type, size_bytes, created_by, updated_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
         returning *
       ), event as (
         insert into public.hr_personnel_record_events (record_id, action, to_status, actor)
         select id, 'created', status, $14 from inserted
       )
       select inserted.*, '/api/admin/hr/compliance/file/' || inserted.id as file_url from inserted`,
      [
        input.teamMemberId,
        input.recordType,
        input.title,
        input.summary,
        input.status,
        input.eventDate,
        input.effectiveDate,
        input.dueAt,
        input.signedAt,
        storagePath,
        safeFileName(input.file.name),
        safe.contentType,
        safe.buffer.byteLength,
        input.actor,
      ],
    );
    if (!row) throw new Error("Could not create the HR record.");
    return row;
  } catch (error) {
    await storage.storage.from(HR_PERSONNEL_BUCKET).remove([storagePath]).catch(() => undefined);
    throw error;
  }
}

export { UploadSecurityError };
