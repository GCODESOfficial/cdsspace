import "server-only";
import { randomUUID } from "crypto";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import {
  assertSecureBuffer,
  assertSafeImage,
  UploadSecurityError,
} from "@/lib/upload-security";

export const TEAM_COMPLIANCE_BUCKET = "team-compliance";
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

function safeName(name: string) {
  return (
    name
      .trim()
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, 180) || "SOP attachment"
  );
}

function sniffVideo(buffer: Buffer) {
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString("latin1") === "ftyp"
  ) {
    const brand = buffer.subarray(8, 12).toString("latin1");
    const quickTime = brand === "qt  ";
    return {
      ext: quickTime ? "mov" : "mp4",
      contentType: quickTime ? "video/quicktime" : "video/mp4",
    };
  }
  if (
    buffer.length >= 4 &&
    buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  ) {
    return { ext: "webm", contentType: "video/webm" };
  }
  throw new UploadSecurityError(
    "Only genuine MP4, MOV, or WebM videos are allowed.",
  );
}

export async function uploadSopMedia(input: {
  file: File;
  sopId: string;
  actor: string;
  memberId?: string | null;
}) {
  let buffer: Buffer;
  let contentType: string;
  let ext: string;
  let mediaType: "image" | "video";

  if (input.file.type.startsWith("image/")) {
    const safe = await assertSafeImage(input.file, {
      maxBytes: 8 * 1024 * 1024,
      maxDimension: 12000,
    });
    buffer = safe.buffer;
    contentType = safe.contentType;
    ext = safe.ext;
    mediaType = "image";
  } else {
    if (input.file.size > MAX_VIDEO_BYTES)
      throw new UploadSecurityError(
        "Video is larger than the 150MB limit.",
        413,
      );
    buffer = Buffer.from(await input.file.arrayBuffer());
    await assertSecureBuffer(buffer, { activeContent: true, fileName: input.file.name });
    const safe = sniffVideo(buffer);
    contentType = safe.contentType;
    ext = safe.ext;
    mediaType = "video";
  }

  const storagePath = `sops/${input.sopId}/${randomUUID()}.${ext}`;
  const db = getGlashDbAdmin() as any;
  const { error } = await db.storage
    .from(TEAM_COMPLIANCE_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });
  if (error) throw new Error(error.message);

  try {
    const row = await glashMaybeOne<any>(
      `insert into public.team_compliance_sop_media
        (sop_id,storage_path,file_name,mime_type,size_bytes,media_type,uploaded_by,uploaded_by_member_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [
        input.sopId,
        storagePath,
        safeName(input.file.name),
        contentType,
        buffer.byteLength,
        mediaType,
        input.actor,
        input.memberId || null,
      ],
    );
    return { ...row, url: `/api/team/compliance/media/${row?.id}` };
  } catch (error) {
    await db.storage
      .from(TEAM_COMPLIANCE_BUCKET)
      .remove([storagePath])
      .catch(() => undefined);
    throw error;
  }
}

export { UploadSecurityError };
