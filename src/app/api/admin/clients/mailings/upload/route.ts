import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { assertSafeImage, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "sales-mailing-images";

export async function POST(req: NextRequest) {
  const { denied } = await requireAdmin(req, "clients.mailings.create");
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a cover or advert image." }, { status: 400 });

  try {
    const safe = await assertSafeImage(file, { maxBytes: 8 * 1024 * 1024, maxDimension: 8000 });
    const storagePath = `sales-mailings/${randomUUID()}.${safe.ext}`;
    const db = getGlashDbAdmin() as any;
    const { error } = await db.storage.from(BUCKET).upload(storagePath, safe.buffer, {
      contentType: safe.contentType,
      upsert: false,
    });
    if (error) throw new Error(error.message);
    const { data: preview } = await db.storage.from(BUCKET).createSignedUrl(storagePath, 15 * 60);
    return NextResponse.json({
      ok: true,
      storage_path: storagePath,
      file_name: file.name.slice(0, 180),
      mime_type: safe.contentType,
      size_bytes: safe.buffer.byteLength,
      width: safe.width,
      height: safe.height,
      preview_url: preview?.signedUrl || null,
    });
  } catch (error) {
    const status = error instanceof UploadSecurityError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Image upload failed." }, { status });
  }
}
