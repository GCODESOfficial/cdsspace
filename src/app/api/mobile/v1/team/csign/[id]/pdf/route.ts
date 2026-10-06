/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";
import { mobileJson } from "@/lib/mobile-api";
import { buildMobileCDocPdf, pdfResponse } from "../../../cdocs/cdoc-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// cSign "Download signed PDF" for the app: the document with the signer's
// signature, as the web list builds it in the browser (src/app/team/csign,
// downloadSigned). Open to whoever sent the request or was asked to sign it,
// and to admins; only once it is signed.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return mobileJson({ ok: false, error: "Unauthorized" }, 401);
  const db = supabaseAdmin as any;
  const { data: request, error } = await db
    .from("team_signature_requests")
    .select("id, document_id, status, signed_png_url, signed_at, signer_email, signer_team_member_id, requested_by")
    .eq("id", id)
    .maybeSingle();
  if (error) return mobileJson({ ok: false, error: error.message }, 500);
  if (!request) return mobileJson({ ok: false, error: "Not found" }, 404);
  if (!actor.is_admin && request.requested_by !== actor.id && request.signer_team_member_id !== actor.id) {
    return mobileJson({ ok: false, error: "Forbidden" }, 403);
  }
  if (request.status !== "signed") return mobileJson({ ok: false, error: "This request hasn't been signed yet." }, 409);

  const [{ data: doc }, signer] = await Promise.all([
    db.from("team_cdocs").select("title, body, theme").eq("id", request.document_id).maybeSingle(),
    request.signer_team_member_id
      ? db.from("team_members").select("full_name").eq("id", request.signer_team_member_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!doc) return mobileJson({ ok: false, error: "The document was removed." }, 404);

  const pdf = await buildMobileCDocPdf({
    title: doc.title,
    body: doc.body || "",
    theme: doc.theme,
    stamped: true,
    signature: {
      image: request.signed_png_url,
      signedAt: request.signed_at,
      signedBy: signer?.data?.full_name || request.signer_email || null,
    },
  });
  return pdfResponse(pdf, `${doc.title} (signed)`);
}
