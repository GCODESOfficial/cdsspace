import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session || (session.role !== "super_admin" && !hasPermission(session.permissions || [], "team_chat.broadcast"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: "Choose an image to upload." }, { status: 400 });
    }
    const safe = await assertSafeUpload(file, {
      allow: ["image"],
      maxBytes: 10 * 1024 * 1024,
      imageMaxDimension: 8000,
    });
    const storage = getGlashDbAdmin() as any;
    if (!storage?.storage) throw new Error("Storage is not configured.");
    const path = `announcements/${new Date().getUTCFullYear()}/${randomUUID()}.${safe.ext}`;
    const { error } = await storage.storage.from("media").upload(path, safe.buffer, {
      contentType: safe.contentType,
      upsert: false,
    });
    if (error) throw new Error(error.message || "Image upload failed.");
    const { data } = storage.storage.from("media").getPublicUrl(path);
    return NextResponse.json({ ok: true, url: data.publicUrl });
  } catch (error) {
    const status = error instanceof UploadSecurityError ? error.status : 500;
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Image upload failed.",
    }, { status });
  }
}
