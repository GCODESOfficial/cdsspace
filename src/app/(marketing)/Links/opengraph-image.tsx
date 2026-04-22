import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";

export const runtime = "nodejs";
export const alt = "CDS Space — Links";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return new ImageResponse(
    renderBrandCard({
      eyebrow: "All our links",
      title: "Find Us Everywhere",
      description:
        "Socials, portfolio, consultation booking, and more — one tap away.",
      tags: ["Instagram", "Twitter", "TikTok", "YouTube", "LinkedIn"],
      domainPath: "/Links",
    }),
    { ...size },
  );
}
