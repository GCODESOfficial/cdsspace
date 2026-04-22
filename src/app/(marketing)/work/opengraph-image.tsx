import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";

export const runtime = "nodejs";
export const alt = "Our Work — CDS Space Design Portfolio";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return new ImageResponse(
    renderBrandCard({
      eyebrow: "Portfolio",
      title: "Our Work",
      description:
        "Brand identity, packaging, environmental branding, and visual systems. See our latest projects and case studies.",
      tags: ["Brand Identity", "Packaging", "Visual Systems", "Case Studies"],
      domainPath: "/work",
    }),
    { ...size },
  );
}
