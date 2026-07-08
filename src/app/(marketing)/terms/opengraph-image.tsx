import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "Terms of Service - CDS Space";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const fonts = getOgFonts();
  return new ImageResponse(
    await renderBrandCard({
      eyebrow: "Legal",
      title: "Terms of Service",
      description:
        "The agreement that governs your use of CDS Space's website, platform, and professional services.",
      tags: ["Terms", "Service Agreement", "Legal"],
      domainPath: "/terms",
    }),
    { ...size, fonts },
  );
}
