import { NextRequest, NextResponse } from "next/server";
import { buildInvoicePdf, invoicePdfFileName } from "@/lib/invoice-pdf";
import { loadServerPdfImage } from "@/lib/finance/invoice-pdf-server";
import { loadPublicInvoice } from "@/lib/finance/public-invoice";
import type { FinanceBankAccount, FinanceInvoice, FinanceInvoiceItem, FinanceReceipt } from "@/lib/finance/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The invoice as a PDF (?kind=receipt for its receipt, once paid), built on the
 * server with the same generator as the web page's "Download PDF". Public by
 * invoice link, like the invoice page. Used by the app's native PDF viewer.
 * ?download=1 asks for a download instead of inline display.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await loadPublicInvoice(token);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wantsReceipt = request.nextUrl.searchParams.get("kind") === "receipt";
  if (wantsReceipt && !data.receipt) return NextResponse.json({ error: "This invoice has no receipt yet." }, { status: 404 });

  const invoice = data.invoice as FinanceInvoice;
  const receipt = wantsReceipt ? (data.receipt as unknown as FinanceReceipt) : undefined;
  try {
    const doc = await buildInvoicePdf(invoice, data.items as FinanceInvoiceItem[], {
      // A receipt carries no payment instructions, as on the web.
      bankAccounts: receipt ? [] : (data.bankAccounts as FinanceBankAccount[]),
      receipt,
      loadImage: loadServerPdfImage,
    });
    const body = Buffer.from(doc.output("arraybuffer"));
    const name = invoicePdfFileName(invoice, receipt);
    const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[invoice/pdf] could not build the PDF", detail);
    // The detail helps diagnose a live failure from the app; it holds no invoice data.
    return NextResponse.json({ error: "The PDF could not be created. Please try again.", detail: detail.slice(0, 300) }, { status: 500 });
  }
}
