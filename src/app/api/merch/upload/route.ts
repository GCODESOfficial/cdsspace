import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;
const PRINT_EXTENSIONS = new Set(["png", "jpg", "jpeg", "pdf", "ai", "fig", "svg"]);
const SAMPLE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "pdf", "ai", "fig", "svg"]);

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
}

export async function POST(request: Request) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const category = form.get("category") === "sample" ? "sample" : "print";
    if (!file) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    const extension = extensionOf(file.name);
    const allowed = category === "print" ? PRINT_EXTENSIONS : SAMPLE_EXTENSIONS;
    if (!allowed.has(extension)) return NextResponse.json({ error: category === "print" ? "Use a PNG, JPG, PDF, AI, FIG, or SVG print file." : "Use an image, PDF, AI, FIG, or SVG sample." }, { status: 415 });
    const safe = await assertSafeUpload(file, { allow: ["image", "pdf", "design"], maxBytes: MAX_BYTES, imageMaxInputPixels: 400_000_000, imageMaxDimension: null, preserveImageBytes: category === "print" });
    const path = `${session.user.id}/merch/${category}/${crypto.randomUUID()}.${safe.ext}`;
    const storage = (supabaseAdmin as any).storage.from("sales-commerce");
    const { error } = await storage.upload(path, safe.buffer, { contentType: safe.contentType, upsert: false });
    if (error) throw error;
    const { data: signed, error: signedError } = await storage.createSignedUrl(path, 60 * 60);
    if (signedError) { await storage.remove([path]); throw signedError; }
    return NextResponse.json({ path, fileName: file.name, previewUrl: signed.signedUrl, contentType: safe.contentType, sizeBytes: safe.buffer.length });
  } catch (error) {
    if (error instanceof UploadSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[merch-upload] failed", error);
    return NextResponse.json({ error: "The merch file could not be uploaded." }, { status: 500 });
  }
}
