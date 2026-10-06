import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import {
  BOARD_PDF_PERMISSION, boardPdfCurrency, boardPdfPeriod, boardPdfView, buildBoardPdf,
} from "@/lib/admin-mobile-projects-board-deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin app: the Executive Board "Export PDF" (and the per-line download
 * buttons), which the web builds in the browser with jsPDF.
 *
 * GET ?view=overview|budgets|expansion-budgets|targets|models|vault   the view's sheet
 *     ?view=budget&id=<uuid> | ?view=expansion-budget&id=<uuid>      one record with its plan
 *     &currency=USD|NGN       the planning currency the board is read in
 *     &year=2026&month=1..12|annual   (budgets) the period on screen
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const view = boardPdfView(params.get("view"));
  const { denied } = await requireAdmin(req, BOARD_PDF_PERMISSION[view]);
  if (denied) return denied;
  try {
    const built = await buildBoardPdf({
      view,
      currency: boardPdfCurrency(params.get("currency")),
      period: boardPdfPeriod(params.get("year"), params.get("month")),
      id: params.get("id") || undefined,
    });
    if (!built) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    return new NextResponse(new Uint8Array(built.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${built.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "The PDF could not be built." },
      { status: 500 },
    );
  }
}
