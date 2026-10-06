import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getCreateActor } from "@/lib/create-platform/session";
import {
  exportExecutiveBoardLetterhead,
  LetterheadMobileError,
  letterheadExportSize,
} from "@/lib/admin-mobile-projects-board-deals-letterhead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET ?id=<letterhead id>&size=original|compressed|lite → the PDF file
 * GET ?id=<letterhead id>&info=1 → { originalBytes } (sizes shown before choosing)
 *
 * Server port of the web studio's in-browser export (exportLetterheadToPdf),
 * including the compressed / lite sharing copies. Marking the document exported
 * stays with the existing PATCH /api/create/letterheads/[id] { action: "exported" }.
 */
export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "executive_board.letterhead_view");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const id = params.get("id") || "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid letterhead ID." }, { status: 400 });
  const actor = await getCreateActor("admin");
  if (!actor) return NextResponse.json({ error: "Your admin session could not be verified." }, { status: 401 });
  const info = params.get("info") === "1";
  const size = info ? "original" : letterheadExportSize(params.get("size"));
  try {
    const result = await exportExecutiveBoardLetterhead(actor, id, size);
    if (info) return NextResponse.json({ ok: true, originalBytes: result.originalBytes }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
    return new NextResponse(result.data, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof LetterheadMobileError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "The PDF could not be exported." }, { status });
  }
}
