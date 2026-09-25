import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { renderPageAsImage } from "unpdf";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { createPrivateAssetPrefix, getLetterhead, LETTERHEAD_BUCKET, LETTERHEAD_MAX_BYTES } from "@/lib/create-platform/letterheads";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashQuery } from "@/lib/glashdb/postgres";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";
import { CLIENT_STORAGE_FULL_CODE, isClientStorageFullError, releaseClientStorageReservation, reserveClientStorage } from "@/lib/client-storage";
import { sendEmail } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "pdf", "svg"]);

function extension(name: string) {
  return name.toLowerCase().split(".").pop()?.replace(/[^a-z0-9]/g, "") || "";
}

async function pngFromUpload(file: File) {
  const ext = extension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new UploadSecurityError("Upload a JPG, PNG, PDF, or SVG file.");
  const safe = await assertSafeUpload(file, { allow: ["image", "pdf", "design"], maxBytes: LETTERHEAD_MAX_BYTES, imageMaxDimension: 16000 });
  if (safe.kind === "pdf") {
    const rendered = await renderPageAsImage(new Uint8Array(safe.buffer), 1, { canvasImport: () => import("@napi-rs/canvas"), scale: 2 });
    return sharp(Buffer.from(rendered)).png().toBuffer();
  }
  if (ext === "svg") return sharp(safe.buffer, { density: 220 }).png().toBuffer();
  return sharp(safe.buffer).png().toBuffer();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCreateActorFromRequest(req);
  const { id } = await params;
  if (!actor) return NextResponse.json({ error: "Sign in to use Create." }, { status: 401 });
  if (actor.accessLocked) return NextResponse.json({ error: "Create is not available on this account yet." }, { status: 403 });
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid letterhead ID." }, { status: 400 });
  const letterhead = await getLetterhead(actor, id);
  if (!letterhead) return NextResponse.json({ error: "Letterhead not found." }, { status: 404 });

  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    const signerEmail = String(body.signerEmail || "").trim().toLowerCase().slice(0, 320);
    const signerName = String(body.signerName || "").trim().slice(0, 160) || null;
    if (!EMAIL.test(signerEmail)) return NextResponse.json({ error: "Enter a valid signer email address." }, { status: 400 });
    const rows = await glashQuery<{ id: string; access_token: string }>(
      `insert into public.create_letterhead_signatures
         (letterhead_id, source, signer_name, signer_email, status)
       values ($1::uuid, 'invitation', $2, $3, 'pending')
       returning id, access_token::text`,
      [id, signerName, signerEmail],
    );
    const request = rows[0];
    if (!request) return NextResponse.json({ error: "The signature request could not be created." }, { status: 500 });
    const shareUrl = `/letterhead-sign/${request.access_token}`;
    const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://cdsspace.pro").replace(/\/$/, "");
    const fullUrl = `${site}${shareUrl}`;
    let emailed = true;
    try {
      await sendEmail({
        to: signerEmail,
        fromName: "CDS Space cSign",
        subject: `Signature requested: ${letterhead.title}`,
        text: `${actor.name || actor.email} invited you to sign “${letterhead.title}”. Open your secure signing link: ${fullUrl}`,
        html: brandedEmailHtml(`<p>Hello ${escapeHtml(signerName || "there")},</p><p><strong>${escapeHtml(actor.name || actor.email)}</strong> invited you to add your signature to <strong>${escapeHtml(letterhead.title)}</strong>.</p><p><a href="${escapeHtml(fullUrl)}" style="display:inline-block;border-radius:10px;background:#0A4FE8;color:#fff;text-decoration:none;padding:12px 20px;font-weight:700;">Review and sign securely</a></p><p>This private link is intended only for ${escapeHtml(signerEmail)}.</p>`, { eyebrow: "Signature request", preheader: `Your signature is requested on ${letterhead.title}.` }),
      });
    } catch {
      emailed = false;
    }
    return NextResponse.json({ ok: true, shareUrl, emailed, letterhead: await getLetterhead(actor, id) }, { status: 201 });
  }

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") || []).filter((value): value is File => value instanceof File && value.size > 0).slice(0, 10);
  if (!files.length) return NextResponse.json({ error: "Choose one or more signature files." }, { status: 400 });
  const existingCount = letterhead.signatures.filter((signature) => signature.status === "ready" || signature.status === "signed").length;
  if (existingCount + files.length > 12) return NextResponse.json({ error: "A letterhead can contain up to 12 additional signatures." }, { status: 400 });

  let reservationId: string | null = null;
  const uploadedPaths: string[] = [];
  try {
    const prepared = await Promise.all(files.map(async (file) => ({ file, png: await pngFromUpload(file) })));
    const totalBytes = prepared.reduce((sum, item) => sum + item.png.byteLength, 0);
    if (actor.kind === "client") reservationId = await reserveClientStorage(actor.id, totalBytes, 0);
    const db = getGlashDbAdmin() as any;
    for (const item of prepared) {
      const signatureId = crypto.randomUUID();
      const path = `${createPrivateAssetPrefix(actor)}/${id}/signature-${signatureId}-${crypto.randomUUID()}.png`;
      const { error } = await db.storage.from(LETTERHEAD_BUCKET).upload(path, item.png, { contentType: "image/png", upsert: false });
      if (error) throw new Error(error.message);
      uploadedPaths.push(path);
      await glashQuery(
        `insert into public.create_letterhead_signatures
           (id, letterhead_id, source, signer_name, status, storage_path, storage_name, size_bytes, signature_x)
         values ($1::uuid, $2::uuid, 'upload', $3, 'ready', $4, $5, $6, $7)`,
        [signatureId, id, item.file.name.replace(/\.[^.]+$/, "").slice(0, 160) || null, path, item.file.name.slice(0, 180), item.png.byteLength, 12 + ((existingCount + uploadedPaths.length - 1) * 14) % 65],
      );
    }
    return NextResponse.json({ ok: true, letterhead: await getLetterhead(actor, id) }, { status: 201 });
  } catch (error) {
    if (uploadedPaths.length) {
      const db = getGlashDbAdmin() as any;
      await db.storage.from(LETTERHEAD_BUCKET).remove(uploadedPaths).catch(() => undefined);
    }
    const storageFull = isClientStorageFullError(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The signatures could not be uploaded.", ...(storageFull ? { code: CLIENT_STORAGE_FULL_CODE } : {}) }, { status: storageFull ? 409 : error instanceof UploadSecurityError ? error.status : 500 });
  } finally {
    await releaseClientStorageReservation(reservationId).catch(() => undefined);
  }
}
