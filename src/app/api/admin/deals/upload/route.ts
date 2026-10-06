import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assertTrustedMutationOrigin } from "@/lib/intelligence/security";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";
import { EMAIL_COVER_BUCKET, EMAIL_COVER_PREFIX, emailCoverPreviewUrl, isEmailCoverPath } from "@/lib/email-cover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const A4_RATIO = 210 / 297;

/** Email covers are used from the prospect composer and the proposal sender. */
async function requireEmailCoverAccess(req: NextRequest) {
  const prospects = await requireAdmin(req, "deals.prospects");
  if (!prospects.denied) return null;
  const proposals = await requireAdmin(req, "deals.proposals");
  return proposals.denied;
}

/** Streams an email cover back to the admin composer for its preview. */
export async function GET(req: NextRequest) {
  const denied = await requireEmailCoverAccess(req);
  if (denied) return denied;
  const path = req.nextUrl.searchParams.get("path") || "";
  if (!isEmailCoverPath(path)) return NextResponse.json({ ok: false, error: "Image not found." }, { status: 404 });
  const storage = getSupabaseAdmin() as any;
  const { data, error } = await storage.storage.from(EMAIL_COVER_BUCKET).download(path);
  if (error || !data) return NextResponse.json({ ok: false, error: "Image not found." }, { status: 404 });
  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=300" },
  });
}

/**
 * An optional picture above an email's message. Any shape is accepted, since
 * it sits on top of the message rather than filling a page, and it is resized
 * to the width an email can show.
 */
async function uploadEmailCover(file: File) {
  const safe = await assertSafeUpload(file, {
    allow: ["image"],
    maxBytes: 10 * 1024 * 1024,
    imageMaxDimension: 12000,
    imageMaxInputPixels: 80_000_000,
  });
  if ((safe.height || 0) > (safe.width || 0) * 2.5) {
    throw new UploadSecurityError("This image is too tall for the top of an email. Use a landscape or square image.", 400);
  }
  const cover = await sharp(safe.buffer)
    .rotate()
    .resize({ width: 1200, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer();
  const storagePath = `${EMAIL_COVER_PREFIX}${randomUUID()}.webp`;
  const storage = getSupabaseAdmin() as any;
  const { error } = await storage.storage.from(EMAIL_COVER_BUCKET).upload(storagePath, cover, {
    contentType: "image/webp",
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(error.message || "The image could not be stored.");
  return NextResponse.json({ ok: true, storage_path: storagePath, mime_type: "image/webp", preview_url: emailCoverPreviewUrl(storagePath) });
}

export async function POST(req: NextRequest) {
  if (!assertTrustedMutationOrigin(req)) {
    return NextResponse.json({ ok: false, error: "Untrusted request origin." }, { status: 403 });
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (form.get("kind") === "email_cover") {
      const denied = await requireEmailCoverAccess(req);
      if (denied) return denied;
      if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose an image." }, { status: 400 });
      return await uploadEmailCover(file);
    }
    const { denied } = await requireAdmin(req, "deals.proposals");
    if (denied) return denied;
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
