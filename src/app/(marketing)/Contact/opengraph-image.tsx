import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "Contact CDS Space";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const fonts = getOgFonts();
  return new ImageResponse(
    await renderBrandCard({
      eyebrow: "Get in touch",
      title: "Let's build your brand",
      description:
        "Tell us about your project and we'll get back within 24 hours. We work with founders, teams, and enterprises worldwide.",
      tags: ["Work With Us", "Project Brief", "24/7 Support"],
      domainPath: "/Contact",
    }),
    { ...size, fonts },
  );
}
