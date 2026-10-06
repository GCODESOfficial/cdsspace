/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { supabaseAdmin } from "@/lib/supabase";
import { adminMobileJson } from "@/lib/admin-mobile";
import { buildMobileCDocPdf, pdfResponse } from "@/app/api/mobile/v1/team/cdocs/cdoc-pdf";

/**
 * Admin app (Workspace → cDocs / cSign): the branded PDFs the web builds in the
 * browser (src/lib/cdocs-pdf.ts, the cSign list's signed download), rendered on
 * the server with the same builder as the team app's PDF routes. The routes
 * check the admin permission first; admins see every document.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://cdsspace.pro").replace(/\/$/, "");

export async function adminCDocPdfResponse(id: string): Promise<Response> {
  if (!supabaseAdmin) return adminMobileJson({ ok: false, error: "Server not configured" }, 500);
  const db = supabaseAdmin as any;
  const { data: doc, error } = await db
    .from("team_cdocs")
    .select("id, title, body, theme, stamped, share_token")
    .eq("id", id)
    .maybeSingle();
  if (error) return adminMobileJson({ ok: false, error: error.message }, 500);
  if (!doc) return adminMobileJson({ ok: false, error: "Not found" }, 404);

  const pdf = await buildMobileCDocPdf({
    title: doc.title,
    body: doc.body || "",
    theme: doc.theme,
    stamped: !!doc.stamped,
    shareUrl: doc.share_token ? `${SITE_URL}/cdocs/${doc.share_token}` : undefined,
  });
  return pdfResponse(pdf, doc.title);
}

// A signed request as a PDF: its cDoc (when it has one; the admin portal can
// request a signature without a document) with the signer's signature.
export async function adminSignedPdfResponse(id: string): Promise<Response> {
  if (!supabaseAdmin) return adminMobileJson({ ok: false, error: "Server not configured" }, 500);
  const db = supabaseAdmin as any;
  const { data: request, error } = await db.from("team_signature_requests").select("*").eq("id", id).maybeSingle();
  if (error) return adminMobileJson({ ok: false, error: error.message }, 500);
  if (!request) return adminMobileJson({ ok: false, error: "Not found" }, 404);
  if (request.status !== "signed") return adminMobileJson({ ok: false, error: "This request hasn't been signed yet." }, 409);

  const [{ data: doc }, signer] = await Promise.all([
    request.document_id
      ? db.from("team_cdocs").select("title, body, theme").eq("id", request.document_id).maybeSingle()
      : Promise.resolve({ data: null }),
    request.signer_team_member_id
      ? db.from("team_members").select("full_name").eq("id", request.signer_team_member_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (request.document_id && !doc) return adminMobileJson({ ok: false, error: "The document was removed." }, 404);

  const title = doc?.title || request.title || "Signature";
  const pdf = await buildMobileCDocPdf({
    title,
    body: doc?.body || request.message || "",
    theme: doc?.theme,
    stamped: true,
    signature: {
      image: request.signed_png_url || null,
      signedAt: request.signed_at,
      signedBy: signer?.data?.full_name || request.signer_name || request.signer_email || null,
    },
  });
  return pdfResponse(pdf, `${title} (signed)`);
}

// The document a signature request asks to be signed, before signing (the admin app's
// native signing step shows it; the web signing page /csign/<token> renders it in HTML).
export async function adminSignRequestDocumentPdfResponse(id: string): Promise<Response> {
  if (!supabaseAdmin) return adminMobileJson({ ok: false, error: "Server not configured" }, 500);
  const db = supabaseAdmin as any;
  const { data: request, error } = await db
    .from("team_signature_requests")
    .select("id, document_id, title, message")
    .eq("id", id)
    .maybeSingle();
  if (error) return adminMobileJson({ ok: false, error: error.message }, 500);
  if (!request) return adminMobileJson({ ok: false, error: "Not found" }, 404);
  if (!request.document_id) return adminMobileJson({ ok: false, error: "This request has no document attached." }, 404);

  const { data: doc } = await db
    .from("team_cdocs")
    .select("title, body, theme, stamped, share_token")
    .eq("id", request.document_id)
    .maybeSingle();
  if (!doc) return adminMobileJson({ ok: false, error: "The document was removed." }, 404);

  const pdf = await buildMobileCDocPdf({
    title: doc.title,
    body: doc.body || "",
    theme: doc.theme,
    stamped: !!doc.stamped,
    shareUrl: doc.share_token ? `${SITE_URL}/cdocs/${doc.share_token}` : undefined,
  });
  return pdfResponse(pdf, doc.title);
}
