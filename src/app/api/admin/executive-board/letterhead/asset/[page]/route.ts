import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { LETTERHEAD_BUCKET } from "@/lib/create-platform/letterheads";
import { getCompanyLetterhead } from "@/lib/create-platform/company-letterhead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Streams private company stationery without exposing its storage path. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ page: string }> }) {
  const { session, denied } = await requireAdmin(req, "executive_board.letterhead_view");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestedPage = (await params).page;
  if (requestedPage !== "first" && requestedPage !== "second") {
    return NextResponse.json({ error: "Letterhead page not found." }, { status: 404 });
  }

  const company = await getCompanyLetterhead();
  const path = requestedPage === "first" ? company.firstPagePath : company.secondPagePath;
  if (!path) return NextResponse.json({ error: "Letterhead page not found." }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getGlashDbAdmin() as any;
  const { data, error } = await db.storage.from(LETTERHEAD_BUCKET).download(path);
  if (error || !data) return NextResponse.json({ error: "Letterhead preview unavailable." }, { status: 404 });

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="cds-letterhead-${requestedPage}.png"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie",
    },
  });
}
