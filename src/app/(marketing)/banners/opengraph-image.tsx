import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "Banners & Environmental Print - CDS Space";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const fonts = getOgFonts();
  return new ImageResponse(
    await renderBrandCard({
      eyebrow: "Industrial print",
      title: "Banners &\nEnvironmental Print",
      description:
        "Large-format banners, out-of-home, and environmental branding - designed, produced, and installed end-to-end.",
      tags: ["Large Format", "OOH", "Installation", "Door-to-door"],
      domainPath: "/banners",
    }),
    { ...size, fonts },
  );
}
