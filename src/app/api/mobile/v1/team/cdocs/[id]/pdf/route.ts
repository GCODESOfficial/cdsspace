/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";
import { mobileJson } from "@/lib/mobile-api";
import { buildMobileCDocPdf, pdfResponse } from "../../cdoc-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://cdsspace.pro").replace(/\/$/, "");

// The cDocs editor's "Download PDF" for the app: the branded PDF the web
// editor builds in the browser (src/lib/cdocs-pdf.ts), rendered on the server.
// Same access as GET /api/cdocs/[id]: the author, or an admin.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return mobileJson({ ok: false, error: "Unauthorized" }, 401);
  const db = supabaseAdmin as any;
  const { data: doc, error } = await db
    .from("team_cdocs")
    .select("id, title, body, theme, stamped, share_token, created_by")
    .eq("id", id)
    .maybeSingle();
  if (error) return mobileJson({ ok: false, error: error.message }, 500);
  if (!doc) return mobileJson({ ok: false, error: "Not found" }, 404);
  if (!actor.is_admin && doc.created_by !== actor.id) return mobileJson({ ok: false, error: "Forbidden" }, 403);

  const pdf = await buildMobileCDocPdf({
    title: doc.title,
    body: doc.body || "",
    theme: doc.theme,
    stamped: !!doc.stamped,
    shareUrl: doc.share_token ? `${SITE_URL}/cdocs/${doc.share_token}` : undefined,
  });
  return pdfResponse(pdf, doc.title);
}
