import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { renderBirthdaySvg } from "@/lib/birthday-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns a shareable PNG birthday card for the given name. */
export async function GET(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req, "clients");
  if (denied) return denied;

  const name = (req.nextUrl.searchParams.get("name") || "Friend").slice(0, 80);
  const svg = renderBirthdaySvg(name);
  try {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="birthday-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "card"}.png"`,
      },
    });
  } catch {
    // Fall back to the raw SVG if this sharp build can't rasterize SVG.
    return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
  }
}
