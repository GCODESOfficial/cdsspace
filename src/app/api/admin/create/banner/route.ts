import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { upsertCreateAdvertBanner } from "@/lib/create-platform/server";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const TARGET_RATIO = 1600 / 500;
const RATIO_TOLERANCE = 0.2;

export async function POST(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "create.manage_tools");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      const banner = await upsertCreateAdvertBanner({ ...body, updatedBy: session.email });
      return NextResponse.json({ ok: true, banner });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a banner image." }, { status: 400 });

    const safe = await assertSafeUpload(file, { allow: ["image"], maxBytes: MAX_BYTES, imageMaxDimension: 5000, imageMaxInputPixels: 24_000_000 });
    if (!safe.width || !safe.height) throw new UploadSecurityError("The banner dimensions could not be read.");
    const ratio = safe.width / safe.height;
    if (Math.abs(ratio - TARGET_RATIO) / TARGET_RATIO > RATIO_TOLERANCE) {
      return NextResponse.json({ error: "Use a wide banner close to 1600 × 500 px (3.2:1 ratio). Artwork within 20% of this ratio is accepted." }, { status: 400 });
    }

    const storage = getSupabaseAdmin() as any;
    if (!storage) return NextResponse.json({ error: "Storage is not configured." }, { status: 500 });
    const storagePath = `create/advert-banners/${crypto.randomUUID()}.${safe.ext}`;
    const bucket = storage.storage.from("media");
    const { error } = await bucket.upload(storagePath, safe.buffer, { contentType: safe.contentType, upsert: false });
    if (error) return NextResponse.json({ error: error.message || "Could not upload the banner." }, { status: 500 });
    const { data } = bucket.getPublicUrl(storagePath);
    const imageUrl = data?.publicUrl;
    if (!imageUrl) return NextResponse.json({ error: "Could not resolve the uploaded banner." }, { status: 500 });

    const banner = await upsertCreateAdvertBanner({
      imageUrl,
      storagePath,
      altText: form.get("altText"),
      targetUrl: form.get("targetUrl"),
      isActive: String(form.get("isActive")) === "true",
      width: safe.width,
      height: safe.height,
      updatedBy: session.email,
    });
    return NextResponse.json({ ok: true, banner });
  } catch (error) {
    if (error instanceof UploadSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the Create advert banner." }, { status: 400 });
  }
}
