import { ImageResponse } from "next/og";
import { renderSolidBlueCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "CDS Space - Home of Best Brands";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const fonts = getOgFonts();
  return new ImageResponse(
    await renderSolidBlueCard({
      title: "Home of Best Brands",
      showDomain: false,
    }),
    { ...size, fonts },
  );
}
