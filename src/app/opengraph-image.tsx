import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "CDS Space - Branding, Web Development & Industrial Print";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const fonts = getOgFonts();
  return new ImageResponse(
    await renderBrandCard({
      eyebrow: "A creative agency",
      title: "CDS Space",
      description:
        "A 24/7 branding studio connecting people, brands, and culture through brand identity, UI/UX, web development, and industrial print.",
      tags: ["Branding", "UI/UX", "Web Development", "Industrial Print", "Consultancy"],
      domainPath: "/",
    }),
    { ...size, fonts },
  );
}
