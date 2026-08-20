import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const catalogue = new URL(request.url).searchParams.get("catalogue") === "merch" ? "merch" : "banners";
  const denied = await requireFinanceAdminAsync(request, catalogue === "merch" ? "clients.merch.edit" : "clients.banners.edit");
  if (denied) return denied;
  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Choose a product presentation image." }, { status: 400 });
    const safe = await assertSafeUpload(file, { allow: ["image"], maxBytes: 20 * 1024 * 1024, imageMaxDimension: 12000 });
    const path = `catalogue/${catalogue}/${crypto.randomUUID()}.${safe.ext}`;
    const db = financeDb();
    const storage = db.storage.from("sales-commerce");
    const { error } = await storage.upload(path, safe.buffer, { contentType: safe.contentType, upsert: false });
    if (error) throw error;
    const { data: signed, error: signedError } = await storage.createSignedUrl(path, 60 * 60);
    if (signedError) {
      await storage.remove([path]);
      throw signedError;
    }
    return NextResponse.json({ path, fileName: file.name, previewUrl: signed.signedUrl });
  } catch (error) {
    if (error instanceof UploadSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[catalog-presentation] upload failed", error);
    return NextResponse.json({ error: "The product presentation could not be uploaded." }, { status: 500 });
  }
}
