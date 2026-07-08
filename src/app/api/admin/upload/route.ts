import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB
const ALLOWED = /^(image\/(png|svg\+xml|jpeg|webp|gif)|video\/(mp4|webm|quicktime))$/;

/**
 * Generic admin asset upload. Any authenticated admin / sub-admin can upload an
 * image (PNG/SVG/JPG/WEBP/GIF) or short clip (MP4/WEBM/MOV); returns a public URL.
 * Used by asset fields across the dashboard (branding presets, blog, etc.).
 *
 * POST multipart/form-data { file, folder? } → { ok, url, file_name, mime_type, size_bytes }
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storage: any = getSupabaseAdmin();
  if (!storage) return NextResponse.json({ ok: false, error: "Storage not configured" }, { status: 500 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const folder = String(form.get("folder") || "uploads").replace(/[^a-z0-9/_-]/gi, "");
  if (!file) return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.test(mime)) {
    return NextResponse.json({ ok: false, error: "Unsupported file type. Use PNG, SVG, JPG, WEBP, or MP4." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "File is too large (max 25MB)." }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${folder || "uploads"}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await storage.storage
    .from("media")
    .upload(path, buffer, { contentType: mime, upsert: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const { data } = storage.storage.from("media").getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl, file_name: file.name, mime_type: mime, size_bytes: file.size });
}
