import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";

export const runtime = "nodejs";
export const alt = "CDS Space Merch";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return new ImageResponse(
    renderBrandCard({
      eyebrow: "Merch",
      title: "Wear the Movement",
      description:
        "Limited-run apparel and accessories from CDS Space — designed in-house, printed with care.",
      tags: ["Apparel", "Print", "Drops"],
      domainPath: "/merch",
    }),
    { ...size },
  );
}
