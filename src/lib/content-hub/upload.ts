import { v4 as uuidv4 } from "uuid";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { mediaKindFromMime, type MediaKind } from "@/lib/content-hub/shared";
import { validateContentHubUpload } from "@/lib/content-hub/upload-limits";
import { assertCleanBuffer } from "@/lib/upload-security";

export interface UploadedContentHubFile {
  url: string;
  kind: MediaKind;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
}

function cleanExt(fileName: string) {
  const ext = (fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || "bin";
}

export async function uploadContentHubFile(file: File, folder = "content-hub"): Promise<UploadedContentHubFile> {
  const validation = validateContentHubUpload(file.size, file.type || "", file.name);
  if (!validation.ok) throw new Error(validation.error);

  // GlashDB storage admin client (untyped - the generated DB type predates these buckets).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storage: any = getGlashDbAdmin();
  if (!storage) throw new Error("Storage not configured");

  const path = `${folder.replace(/^\/+|\/+$/g, "")}/${uuidv4()}.${cleanExt(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  // Reject executables / EICAR before anything is written to storage.
  assertCleanBuffer(buffer);
  const contentType = file.type || "application/octet-stream";

  const { error } = await storage.storage
    .from("media")
    .upload(path, buffer, { contentType, upsert: false });
  if (error) throw new Error(error.message);

  const { data } = storage.storage.from("media").getPublicUrl(path);
  return {
    url: data.publicUrl,
    kind: mediaKindFromMime(contentType),
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
  };
}
