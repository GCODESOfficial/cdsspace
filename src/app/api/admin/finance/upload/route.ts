import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req); if (denied) return denied;
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const folder = (form.get("folder") as string) || "finance";
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 25MB." }, { status: 413 });
  let safe: Awaited<ReturnType<typeof assertSafeUpload>>;
  try {
    safe = await assertSafeUpload(file, { allow: ["image", "pdf", "office", "zip", "design"], maxBytes: MAX_BYTES });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload blocked." }, { status: error instanceof UploadSecurityError ? error.status : 400 });
  }
  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, "").replace(/\.\./g, "").slice(0, 120) || "finance";
  const path = `${safeFolder}/${uuidv4()}.${safe.ext}`;
  const sb = financeDb();
  const { error } = await sb.storage.from("media").upload(path, safe.buffer, { contentType: safe.contentType, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data } = sb.storage.from("media").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
