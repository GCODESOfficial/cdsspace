import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { adminCDocPdfResponse } from "@/lib/admin-mobile-workspace-docs";
import { vaultCDocSourceId } from "@/lib/admin-mobile-projects-board-deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin app: open a cDoc attached in the Executive Board vault as a PDF.
 *
 * The web's vault download (GET /api/admin/executive-board/vault?file=<id>)
 * redirects an attached cDoc to its team-portal page; the app shows the cDoc
 * natively instead. Guarded like that download (vault_view), so a board member
 * who may read the vault can read what is filed in it without also needing the
 * cDocs workspace permission. The PDF is the same one the admin cDocs route
 * builds (adminCDocPdfResponse).
 *
 * GET ?file=<vault file id>
 */
export async function GET(req: NextRequest) {
  const { denied } = await requireAdmin(req, "executive_board.vault_view");
  if (denied) return denied;
  const sourceId = await vaultCDocSourceId(String(req.nextUrl.searchParams.get("file") || ""));
  if (!sourceId) return NextResponse.json({ ok: false, error: "The attached cDoc is no longer available." }, { status: 404 });
  return adminCDocPdfResponse(sourceId);
}
