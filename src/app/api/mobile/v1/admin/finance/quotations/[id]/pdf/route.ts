import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { financeDb } from "@/lib/finance/api-auth";
import { buildQuotationPdf, quotationPdfFileName } from "@/lib/admin-mobile-finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin app: the quotation as a PDF, built on the server with the same layout
 * as the web page's "PDF" button (which builds it in the browser). Shown in the
 * app's native PDF viewer. Same access as reading the quotation on the web
 * (GET /api/admin/finance/quotations/[id]). ?download=1 asks for a download;
 * ?lang=fr translates the fixed labels, as the web does for the visitor's language.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin(req, "finance_quotations");
  if (denied) return denied;

  const { id } = await params;
  const sb = financeDb();
  const { data: quotation, error } = await sb.from("finance_quotations").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  const [{ data: items }, { data: samples }] = await Promise.all([
    sb.from("finance_quotation_items").select("*").eq("quotation_id", id).order("position"),
    sb.from("finance_quotation_samples").select("*").eq("quotation_id", id).order("position"),
  ]);

  try {
    const doc = await buildQuotationPdf(quotation, items ?? [], samples ?? [], { lang: req.nextUrl.searchParams.get("lang") });
    const body = Buffer.from(doc.output("arraybuffer"));
    const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${quotationPdfFileName(quotation)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[mobile/admin/finance/quotation-pdf] could not build the PDF", detail);
    return NextResponse.json({ error: "The PDF could not be created. Please try again.", detail: detail.slice(0, 300) }, { status: 500 });
  }
}
