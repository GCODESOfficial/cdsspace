import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "pdf", "ai", "fig", "svg"]);
const MAX_ASPECT_RATIO_DIFFERENCE = 0.2;

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
}

export async function POST(request: Request) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const category = form.get("category") === "reference" ? "reference" : "artwork";
    if (!file) return NextResponse.json({ error: "Choose a print file to upload." }, { status: 400 });

    const requestedExtension = extensionOf(file.name);
    if (!ALLOWED_EXTENSIONS.has(requestedExtension)) {
      return NextResponse.json({ error: "Use a PNG, JPG, PDF, AI, FIG, or SVG file." }, { status: 415 });
    }

    const safe = await assertSafeUpload(file, {
      allow: ["image", "pdf", "design"],
      maxBytes: MAX_BYTES,
      imageMaxDimension: category === "artwork" ? null : undefined,
      imageMaxInputPixels: category === "artwork" ? 400_000_000 : undefined,
      preserveImageBytes: category === "artwork",
    });
    const targetWidth = Number(form.get("targetWidth"));
    const targetHeight = Number(form.get("targetHeight"));
    let ratioDifference: number | null = null;
    if (category === "artwork" && safe.kind === "image" && safe.width && safe.height && targetWidth > 0 && targetHeight > 0) {
      const uploadedRatio = safe.width / safe.height;
      const targetRatio = targetWidth / targetHeight;
      ratioDifference = Math.abs(uploadedRatio - targetRatio) / targetRatio;
      if (ratioDifference > MAX_ASPECT_RATIO_DIFFERENCE) {
        return NextResponse.json({
          error: `This artwork's aspect ratio is ${Math.round(ratioDifference * 100)}% away from the selected banner. Use artwork closer to ${targetWidth}:${targetHeight}; the pixel dimensions themselves may be any size.`,
        }, { status: 422 });
      }
    }
    const storageExtension = safe.ext === "jpg" && requestedExtension === "jpeg" ? "jpg" : safe.ext;
    const path = `${session.user.id}/${category}/${crypto.randomUUID()}.${storageExtension}`;
    // Storage/auth is provided by the Supabase-compatible layer while the
    // application's table queries use GlashDB. The compatibility client has
    // a deliberately narrower inferred type, so keep this boundary local.
    const storage = (supabaseAdmin as any).storage.from("banners");
    const { error: uploadError } = await storage.upload(path, safe.buffer, {
      contentType: safe.contentType,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    return NextResponse.json({
      ok: true,
      storagePath: path,
      previewUrl: `/api/banners/file?path=${encodeURIComponent(path)}`,
      fileName: file.name,
      sizeBytes: safe.buffer.length,
      contentType: safe.contentType,
      aspectRatioDifference: ratioDifference === null ? null : Math.round(ratioDifference * 1000) / 10,
      aspectRatioStatus: ratioDifference === null ? "not-checked" : ratioDifference <= 0.08 ? "close" : "manageable",
    });
  } catch (error) {
    if (error instanceof UploadSecurityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[banner-upload] failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The print file could not be uploaded." }, { status: 500 });
  }
}
