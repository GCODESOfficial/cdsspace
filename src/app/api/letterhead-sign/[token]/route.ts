import crypto from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createPrivateAssetPrefix, LETTERHEAD_BUCKET, LETTERHEAD_MAX_BYTES } from "@/lib/create-platform/letterheads";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";
import { CLIENT_STORAGE_FULL_CODE, isClientStorageFullError, releaseClientStorageReservation, reserveClientStorage } from "@/lib/client-storage";
import { sendEmail } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SignRequest = {
  id: string;
  letterhead_id: string;
  signer_name: string | null;
  signer_email: string | null;
  status: "pending" | "opened" | "signed" | "declined";
  owner_kind: "client" | "team" | "admin";
  owner_id: string;
  actor_email: string | null;
  title: string;
  body_html: string;
  paper_size: "a4" | "legal";
  bottom_margin: "wide" | "small";
  has_second_page: boolean;
  first_page_path: string | null;
  second_page_path: string | null;
  stamp_path: string | null;
  stamp_x: number;
  stamp_y: number;
  stamp_width: number;
  stamp_page: "first" | "last";
  signature_x: number;
  signature_y: number;
  signature_width: number;
  signature_page: "first" | "last";
};

async function requestForToken(token: string) {
  return glashMaybeOne<SignRequest>(
    `select signature.id, signature.letterhead_id, signature.signer_name, signature.signer_email, signature.status,
            signature.signature_x, signature.signature_y, signature.signature_width, signature.signature_page,
            letterhead.owner_kind, letterhead.owner_id, letterhead.actor_email, letterhead.title, letterhead.body_html,
            letterhead.paper_size, letterhead.bottom_margin, letterhead.has_second_page,
            letterhead.first_page_path, letterhead.second_page_path,
            letterhead.stamp_path, letterhead.stamp_x, letterhead.stamp_y, letterhead.stamp_width, letterhead.stamp_page
       from public.create_letterhead_signatures signature
       join public.create_letterheads letterhead on letterhead.id = signature.letterhead_id
      where signature.access_token = $1::uuid and signature.source = 'invitation' and letterhead.deleted_at is null`,
    [token],
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: "This signing link is not valid." }, { status: 404 });
  const request = await requestForToken(token);
  if (!request) return NextResponse.json({ error: "This signing link is not available." }, { status: 404 });
  if (request.status === "pending") {
    const db = getGlashDbAdmin() as any;
    await db.from("create_letterhead_signatures").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", request.id).eq("status", "pending");
    request.status = "opened";
  }
  const version = (path: string | null) => path?.split("/").pop() || "";
  const asset = (kind: "firstPage" | "secondPage" | "stamp", path: string | null) => path
    ? `/api/letterhead-sign/${encodeURIComponent(token)}/asset/${kind}?v=${encodeURIComponent(version(path))}`
    : null;
  return NextResponse.json({
    ok: true,
    request: {
      signerName: request.signer_name,
      signerEmail: request.signer_email,
      status: request.status,
      signatureX: Number(request.signature_x || 54),
      signatureY: Number(request.signature_y || 72),
      signatureWidth: Number(request.signature_width || 22),
      signaturePage: request.signature_page === "first" ? "first" : "last",
    },
    document: {
      title: request.title,
      bodyHtml: request.body_html,
      paperSize: request.paper_size === "legal" ? "legal" : "a4",
      bottomMargin: request.bottom_margin === "small" ? "small" : "wide",
      hasSecondPage: Boolean(request.has_second_page),
      firstPageUrl: asset("firstPage", request.first_page_path),
      secondPageUrl: asset("secondPage", request.second_page_path),
      stampUrl: asset("stamp", request.stamp_path),
      stampX: Number(request.stamp_x || 62),
      stampY: Number(request.stamp_y || 68),
      stampWidth: Number(request.stamp_width || 20),
      stampPage: request.stamp_page === "first" ? "first" : "last",
    },
  }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

function numberInRange(value: FormDataEntryValue | null, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: "This signing link is not valid." }, { status: 404 });
  const request = await requestForToken(token);
  if (!request) return NextResponse.json({ error: "This signing link is not available." }, { status: 404 });
  if (request.status === "signed") return NextResponse.json({ error: "This document has already been signed." }, { status: 409 });
  if (request.status === "declined") return NextResponse.json({ error: "This signature request was declined." }, { status: 409 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Draw your signature before submitting." }, { status: 400 });
  const signatureX = numberInRange(form?.get("signatureX") || null, 0, 95, Number(request.signature_x || 54));
  const signatureY = numberInRange(form?.get("signatureY") || null, 0, 95, Number(request.signature_y || 72));
  const signatureWidth = numberInRange(form?.get("signatureWidth") || null, 5, 80, Number(request.signature_width || 22));
  const signaturePage = form?.get("signaturePage") === "first" ? "first" : "last";

  let reservationId: string | null = null;
  let storagePath = "";
  try {
    const safe = await assertSafeUpload(file, { allow: ["image"], maxBytes: LETTERHEAD_MAX_BYTES, imageMaxDimension: 8000 });
    const png = await sharp(safe.buffer).png().toBuffer();
    if (request.owner_kind === "client") reservationId = await reserveClientStorage(request.owner_id, png.byteLength, 0);
    storagePath = `${createPrivateAssetPrefix({ kind: request.owner_kind, id: request.owner_id })}/${request.letterhead_id}/invited-signature-${request.id}-${crypto.randomUUID()}.png`;
    const db = getGlashDbAdmin() as any;
    const { error: uploadError } = await db.storage.from(LETTERHEAD_BUCKET).upload(storagePath, png, { contentType: "image/png", upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    const { data: updated, error: updateError } = await db.from("create_letterhead_signatures").update({ status: "signed", storage_path: storagePath, storage_name: file.name.slice(0, 180), size_bytes: png.byteLength, signature_x: signatureX, signature_y: signatureY, signature_width: signatureWidth, signature_page: signaturePage, signed_at: new Date().toISOString() }).eq("id", request.id).in("status", ["pending", "opened"]).select("id").maybeSingle();
    if (updateError || !updated) throw new Error(updateError?.message || "This signing link was already completed.");
    if (request.actor_email) {
      await sendEmail({
        to: request.actor_email,
        fromName: "CDS Space cSign",
        subject: `Signature completed: ${request.title}`,
        text: `${request.signer_name || request.signer_email || "Your signer"} completed the signature request for “${request.title}”.`,
        html: brandedEmailHtml(`<p><strong>${escapeHtml(request.signer_name || request.signer_email || "Your signer")}</strong> completed the signature request for <strong>${escapeHtml(request.title)}</strong>.</p><p>The signature is now available in your letterhead editor and will be included in the exported PDF.</p>`, { eyebrow: "Signature completed", preheader: `A signer completed ${request.title}.` }),
      }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (storagePath) {
      const db = getGlashDbAdmin() as any;
      await db.storage.from(LETTERHEAD_BUCKET).remove([storagePath]).catch(() => undefined);
    }
    const storageFull = isClientStorageFullError(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The signature could not be submitted.", ...(storageFull ? { code: CLIENT_STORAGE_FULL_CODE } : {}) }, { status: storageFull ? 409 : error instanceof UploadSecurityError ? error.status : 500 });
  } finally {
    await releaseClientStorageReservation(reservationId).catch(() => undefined);
  }
}
