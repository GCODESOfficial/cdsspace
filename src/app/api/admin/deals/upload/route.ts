import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assertTrustedMutationOrigin } from "@/lib/intelligence/security";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const A4_RATIO = 210 / 297;

export async function POST(req: NextRequest) {
  if (!assertTrustedMutationOrigin(req)) {
    return NextResponse.json({ ok: false, error: "Untrusted request origin." }, { status: 403 });
  }
  const { denied } = await requireAdmin(req, "deals.proposals");
  if (denied) return denied;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Choose an A4 portrait cover image." }, { status: 400 });
    }
    const safe = await assertSafeUpload(file, {
      allow: ["image"],
      maxBytes: 10 * 1024 * 1024,
      imageMaxDimension: 12000,
      imageMaxInputPixels: 80_000_000,
    });
    const width = safe.width || 0;
    const height = safe.height || 0;
    const ratio = width / Math.max(1, height);
    if (!width || !height || height <= width || Math.abs(ratio - A4_RATIO) / A4_RATIO > 0.2) {
      return NextResponse.json({
        ok: false,
        error: "The proposal cover must be portrait and within 20% of the A4 page ratio (210 × 297).",
      }, { status: 400 });
    }

    const cleanCover = await sharp(safe.buffer)
      .rotate()
      .resize({ width: 1600, height: 2263, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
    const storagePath = `proposals/${randomUUID()}.webp`;
    const storage = getSupabaseAdmin() as any;
    const { error } = await storage.storage.from("deals-assets").upload(storagePath, cleanCover, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw new Error(error.message || "The proposal cover could not be stored.");
    const { data } = await storage.storage.from("deals-assets").createSignedUrl(storagePath, 3600);
    return NextResponse.json({
      ok: true,
      storage_path: storagePath,
      mime_type: "image/webp",
      preview_url: data?.signedUrl || null,
    });
  } catch (error) {
    const status = error instanceof UploadSecurityError ? error.status : 500;
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "The proposal cover could not be uploaded.",
    }, { status });
  }
}
