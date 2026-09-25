import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { renderPageAsImage } from "unpdf";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { clearLetterheadAsset, createPrivateAssetPrefix, getLetterhead, getLetterheadAssetReplacement, LETTERHEAD_BUCKET, LETTERHEAD_MAX_BYTES, updateLetterheadAsset } from "@/lib/create-platform/letterheads";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";
import { CLIENT_STORAGE_FULL_CODE, isClientStorageFullError, releaseClientStorageReservation, reserveClientStorage } from "@/lib/client-storage";
import { removeSignatureBackground } from "@/lib/signature-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "pdf", "svg"]);
type AssetKind = "firstPage" | "secondPage" | "signature" | "stamp";

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
  if (kind !== "firstPage" && kind !== "secondPage" && kind !== "signature" && kind !== "stamp") return NextResponse.json({ error: "Invalid asset type." }, { status: 400 });

  let storagePath = "";
  let reservationId: string | null = null;
  let previousAsset: Awaited<ReturnType<typeof getLetterheadAssetReplacement>> | null = null;
  try {
    let png = await pngFromUpload(file);
    // A signature or seal is photographed on paper, so the paper comes with
    // it. Lift the ink off its background before it ever reaches the page,
    // otherwise it lands on the letter as a pale box over the letterhead.
    if (kind === "signature" || kind === "stamp") {
      const cleaned = await removeSignatureBackground(png).catch((error) => {
        console.error("[signature-cleanup] keeping the image as uploaded", error);
        return null;
      });
      if (cleaned) png = cleaned.buffer;
    }
    if (actor.kind === "client") {
      previousAsset = await getLetterheadAssetReplacement(actor, id, kind as AssetKind);
      const replacingBytes = previousAsset.referenceCount <= 1 ? previousAsset.bytes : 0;
      reservationId = await reserveClientStorage(actor.id, png.byteLength, replacingBytes);
    } else {
      previousAsset = await getLetterheadAssetReplacement(actor, id, kind as AssetKind);
    }
    storagePath = `${createPrivateAssetPrefix(actor)}/${id}/${kind}-${crypto.randomUUID()}.png`;
    const db = getGlashDbAdmin() as any;
    const { error: uploadError } = await db.storage.from(LETTERHEAD_BUCKET).upload(storagePath, png, { contentType: "image/png", upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    const letterhead = await updateLetterheadAsset(actor, id, kind as AssetKind, storagePath, file.name, png.byteLength);
    if (previousAsset.path && previousAsset.referenceCount <= 1) {
      await db.storage.from(LETTERHEAD_BUCKET).remove([previousAsset.path]).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, letterhead });
  } catch (error) {
    if (storagePath) {
      const db = getGlashDbAdmin() as any;
      await db.storage.from(LETTERHEAD_BUCKET).remove([storagePath]);
    }
    const storageFull = isClientStorageFullError(error);
    const status = storageFull ? 409 : error instanceof UploadSecurityError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "The asset could not be uploaded.", ...(storageFull ? { code: CLIENT_STORAGE_FULL_CODE } : {}) }, { status });
  } finally {
    await releaseClientStorageReservation(reservationId).catch(() => undefined);
  }
}

/** Removes a signature, seal or letterhead design from the document. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCreateActorFromRequest(req);
  const { id } = await params;
  if (!actor) return NextResponse.json({ error: "Sign in to use Create." }, { status: 401 });
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid document." }, { status: 400 });
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "firstPage" && kind !== "secondPage" && kind !== "signature" && kind !== "stamp") {
    return NextResponse.json({ error: "Invalid asset type." }, { status: 400 });
  }
  try {
    const { letterhead, previous } = await clearLetterheadAsset(actor, id, kind as AssetKind);
    // A duplicated document can share the same file, so it is only deleted
    // when this was the last document pointing at it.
    if (previous.path && previous.referenceCount <= 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = getGlashDbAdmin() as any;
      // Deleting the object is what frees the client's space: usage is
      // measured from what is actually stored.
      await db.storage.from(LETTERHEAD_BUCKET).remove([previous.path]).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, letterhead });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The asset could not be removed." }, { status: 400 });
  }
}
