import { NextRequest, NextResponse } from "next/server";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { buildDealAuditPdf, dealAuditFileName, type DealAuditDocument } from "@/lib/deal-audit-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The same document the client reads on the shared page, as a file they can keep. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Invalid link." }, { status: 400 });
  const audit = await glashMaybeOne<DealAuditDocument>(
    `select brand_name, target_url, overall_score, content, created_at
       from public.deal_brand_audits
      where public_token=$1 and share_enabled and status in ('generated','reviewed')`,
    [token],
  );
  if (!audit) return NextResponse.json({ error: "This audit is no longer available." }, { status: 404 });
  const pdf = buildDealAuditPdf(audit);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${dealAuditFileName(audit)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
