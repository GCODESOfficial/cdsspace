import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { buildFinancialAuditPdf, sanitizeExportRows } from "@/lib/admin-mobile-payroll-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { rows: string[][], periodLabel: string } → { pdf: base64 }
 *
 * The admin app's Finance › Audit "Download PDF". The web builds this PDF in the
 * browser with jsPDF from the same export rows; the app posts its rows here and
 * gets the identical document back to save or share.
 */
export async function POST(req: NextRequest) {
  const { denied } = await requireAdmin(req, "finance_audit.export");
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const rows = sanitizeExportRows(body?.rows);
  if (!rows) return NextResponse.json({ error: "A valid financial audit export is required." }, { status: 400 });
  const periodLabel = typeof body?.periodLabel === "string" ? body.periodLabel.slice(0, 120) : "";
  const pdf = buildFinancialAuditPdf(rows, periodLabel);
  return NextResponse.json({ pdf: Buffer.from(pdf).toString("base64") }, { headers: { "Cache-Control": "no-store" } });
}
