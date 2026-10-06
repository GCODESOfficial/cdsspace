import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getCreateActor } from "@/lib/create-platform/session";
import { LetterheadMobileError, previewExecutiveBoardLetterhead } from "@/lib/admin-mobile-projects-board-deals-letterhead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET ?id=<letterhead id> → { pages: ["data:image/jpeg;base64,…"], pageCount, paperSize }
 *
 * The web studio lays the letter out with jsPDF and paints the pages with pdf.js
 * in the browser ("Exact PDF preview"). The app cannot, so the same layout runs
 * here for one of the signed-in admin's Executive Board documents.
 */
export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "executive_board.letterhead_view");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid letterhead ID." }, { status: 400 });
  const actor = await getCreateActor("admin");
  if (!actor) return NextResponse.json({ error: "Your admin session could not be verified." }, { status: 401 });
  try {
    const preview = await previewExecutiveBoardLetterhead(actor, id);
    return NextResponse.json({ ok: true, ...preview }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const status = error instanceof LetterheadMobileError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "The preview could not be prepared." }, { status });
  }
}
