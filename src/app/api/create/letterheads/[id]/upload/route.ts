import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { renderPageAsImage } from "unpdf";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { createPrivateAssetPrefix, getLetterhead, LETTERHEAD_BUCKET, LETTERHEAD_MAX_BYTES, updateLetterheadAsset } from "@/lib/create-platform/letterheads";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "pdf", "svg"]);
type AssetKind = "firstPage" | "secondPage" | "signature";

function extension(name: string) {
  return name.toLowerCase().split(".").pop()?.replace(/[^a-z0-9]/g, "") || "";
}

async function pngFromUpload(file: File) {
  const ext = extension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new UploadSecurityError("Upload a JPG, PNG, PDF, or SVG file.");
  const safe = await assertSafeUpload(file, { allow: ["image", "pdf", "design"], maxBytes: LETTERHEAD_MAX_BYTES, imageMaxDimension: 16000 });
  if (safe.kind === "pdf") {
    const rendered = await renderPageAsImage(new Uint8Array(safe.buffer), 1, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: 2,
    });
    return sharp(Buffer.from(rendered)).png().toBuffer();
  }
  if (ext === "svg") return sharp(safe.buffer, { density: 220 }).png().toBuffer();
  return sharp(safe.buffer).png().toBuffer();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCreateActorFromRequest(req);
  const { id } = await params;
  if (!actor) return NextResponse.json({ error: "Sign in to use Create." }, { status: 401 });
  if (actor.accessLocked) return NextResponse.json({ error: "Create is not available on client accounts yet." }, { status: 403 });
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid letterhead ID." }, { status: 400 });
  if (!(await getLetterhead(actor, id))) return NextResponse.json({ error: "Letterhead not found." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (kind !== "firstPage" && kind !== "secondPage" && kind !== "signature") return NextResponse.json({ error: "Invalid asset type." }, { status: 400 });

  let storagePath = "";
  try {
    const png = await pngFromUpload(file);
    storagePath = `${createPrivateAssetPrefix(actor)}/${id}/${kind}-${crypto.randomUUID()}.png`;
    const db = getGlashDbAdmin() as any;
    const { error: uploadError } = await db.storage.from(LETTERHEAD_BUCKET).upload(storagePath, png, { contentType: "image/png", upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    const letterhead = await updateLetterheadAsset(actor, id, kind as AssetKind, storagePath, file.name);
    return NextResponse.json({ ok: true, letterhead });
  } catch (error) {
    if (storagePath) {
      const db = getGlashDbAdmin() as any;
      await db.storage.from(LETTERHEAD_BUCKET).remove([storagePath]);
    }
    const status = error instanceof UploadSecurityError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "The asset could not be uploaded." }, { status });
  }
}
