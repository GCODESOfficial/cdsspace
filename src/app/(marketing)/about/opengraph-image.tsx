import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "About CDS Space - Our Team, Culture & Open Roles";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const fonts = getOgFonts();
  return new ImageResponse(
    await renderBrandCard({
      eyebrow: "About us",
      title: "Our Team, Culture & Open Roles",
      description:
        "Meet the designers, engineers, and strategists shaping iconic brands at CDS Space. We're hiring across design, engineering, and brand strategy.",
      tags: ["Our Team", "Culture", "Hiring", "Internships"],
      domainPath: "/about",
    }),
    { ...size, fonts },
  );
}
