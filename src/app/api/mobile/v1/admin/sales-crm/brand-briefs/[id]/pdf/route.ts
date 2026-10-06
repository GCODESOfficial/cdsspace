/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { briefToDraft } from "@/lib/brand-brief";
import { brandBriefPdfFileName, buildBrandBriefPdf } from "@/lib/admin-mobile-sales-crm-brief-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The brand brief detail page's "Download PDF" for the app: the web builds the
// PDF in the browser (src/lib/brand-brief-pdf.ts); the app has no browser, so
// the same layout is rendered here. Same access as GET /api/admin/brand-briefs/[id].
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin(req, "brand_briefs");
  if (denied) return denied;
  const { id } = await params;
  const sb = getSupabaseAdmin() as any;
  const { data: brief, error } = await sb.from("brand_briefs").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!brief) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const draft = briefToDraft(brief);
  const pdf = buildBrandBriefPdf(draft, {
    inviteLabel: brief.invite_label,
    status: brief.status,
    submittedAt: brief.submitted_at,
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${brandBriefPdfFileName(draft.brand_name || brief.invite_label)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
