import { v4 as uuidv4 } from "uuid";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { mediaKindFromMime, type MediaKind } from "@/lib/content-hub/shared";
import { validateContentHubUpload } from "@/lib/content-hub/upload-limits";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export interface UploadedContentHubFile {
  url: string;
  kind: MediaKind;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
}

export async function uploadContentHubFile(file: File, folder = "content-hub"): Promise<UploadedContentHubFile> {
  const validation = validateContentHubUpload(file.size, file.type || "", file.name);
  if (!validation.ok) throw new Error(validation.error);

  // GlashDB storage admin client (untyped - the generated DB type predates these buckets).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storage: any = getGlashDbAdmin();
  if (!storage) throw new Error("Storage not configured");

  const maxBytes = validation.kind === "video" ? 100 * 1024 * 1024 : validation.kind === "image" ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
  if (file.size > maxBytes) throw new UploadSecurityError("This file is too large for the content library.", 413);
  const safe = await assertSafeUpload(file, { allow: ["image", "pdf", "office", "zip", "design"], maxBytes });
  if ((validation.kind === "image" && safe.kind !== "image")
    || (validation.kind === "video" && !safe.contentType.startsWith("video/"))) {
    throw new UploadSecurityError("The file contents do not match the selected media type.");
  }
  const path = `${folder.replace(/^\/+|\/+$/g, "")}/${uuidv4()}.${safe.ext}`;
  const contentType = safe.contentType;

  const { error } = await storage.storage
    .from("media")
    .upload(path, safe.buffer, { contentType, upsert: false });
  if (error) throw new Error(error.message);

  const { data } = storage.storage.from("media").getPublicUrl(path);
  return {
    url: data.publicUrl,
    kind: mediaKindFromMime(contentType),
    file_name: file.name,
    mime_type: contentType,
    size_bytes: safe.buffer.length,
  };
}
