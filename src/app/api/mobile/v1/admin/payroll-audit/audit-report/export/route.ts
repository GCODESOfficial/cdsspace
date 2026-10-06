import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { collectAuditReport } from "@/lib/audit-report";
import { auditReportPdf, auditReportRange, drawAuditReportPng } from "@/lib/admin-mobile-payroll-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&format=png|pdf
 *
 * The admin app's Audit & Report "PNG" / "PDF" downloads: the same report
 * graphic the web draws on a <canvas> (and slices onto A4 for the PDF), drawn
 * here so the phone receives a finished file.
 */
export async function GET(req: NextRequest) {
  const { denied } = await requireAdmin(req, "audit_report.export");
  if (denied) return denied;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "png";
  const range = auditReportRange(url);
  const report = await collectAuditReport(range);
  const { png, width, height } = drawAuditReportPng(report);
  const name = `cds-audit-report-${range.from}_${range.to}.${format}`;
  const headers = { "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "no-store" };
  if (format === "png") {
    return new NextResponse(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } });
  }
  const pdf = auditReportPdf(png, width, height);
  return new NextResponse(new Uint8Array(pdf), { headers: { ...headers, "Content-Type": "application/pdf" } });
}
