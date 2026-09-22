import { ImageResponse } from "next/og";
import { renderSolidBlueCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "Tech Careers - Join CDS Space";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const fonts = getOgFonts();
  return new ImageResponse(
    await renderSolidBlueCard({
      eyebrow: "Careers",
      title: "Build your career with CDS Space",
      description:
        "Explore open roles and do meaningful work for ambitious brands.",
    }),
    { ...size, fonts },
  );
}
