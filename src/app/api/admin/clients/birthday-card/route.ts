import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { birthdayCardPng, birthdayGender } from "@/lib/birthday-card-image";
import { birthdayCardSvg } from "@/lib/birthday-artwork";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns the shareable PNG birthday card for the chosen design. */
export async function GET(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req, "clients");
  if (denied) return denied;

  const name = (req.nextUrl.searchParams.get("name") || "Friend").slice(0, 80);
  const gender = birthdayGender(req.nextUrl.searchParams.get("gender"));
  const png = await birthdayCardPng(gender, name);
  if (!png) {
    // Fall back to the raw SVG if this sharp build can't rasterize SVG.
    const svg = await birthdayCardSvg(gender, name);
    return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
  }

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="birthday-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "card"}.png"`,
    },
  });
}
