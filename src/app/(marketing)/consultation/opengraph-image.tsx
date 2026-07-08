import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "Book a Brand Consultation - CDS Space";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const fonts = getOgFonts();
  return new ImageResponse(
    await renderBrandCard({
      eyebrow: "Free 30-min call",
      title: "Book a Consultation",
      description:
        "A focused session with our brand strategists. Bring your goals - leave with a clear direction for identity, product, or growth.",
      tags: ["Strategy", "Identity", "Product", "Growth"],
      domainPath: "/consultation",
    }),
    { ...size, fonts },
  );
}
