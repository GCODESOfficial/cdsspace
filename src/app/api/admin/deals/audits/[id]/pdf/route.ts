import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { buildDealAuditPdf, dealAuditFileName, type DealAuditDocument } from "@/lib/deal-audit-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin(req, "deals.audits");
  if (denied) return denied;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid audit." }, { status: 400 });
  const audit = await glashMaybeOne<DealAuditDocument>(
    `select brand_name, target_url, overall_score, content, created_at from public.deal_brand_audits where id=$1`,
    [id],
  );
  if (!audit) return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  const pdf = buildDealAuditPdf(audit);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${dealAuditFileName(audit)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
