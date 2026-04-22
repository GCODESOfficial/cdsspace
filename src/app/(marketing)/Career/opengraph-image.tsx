import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";

export const runtime = "nodejs";
export const alt = "Tech Careers — Join CDS Space";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return new ImageResponse(
    renderBrandCard({
      eyebrow: "We're hiring",
      title: "Join CDS Space",
      description:
        "Open roles at CDS Space. Mentorship, flexible schedules, faith-sensitive workplace, and a culture that ships iconic work.",
      tags: ["Design", "Engineering", "Brand Strategy", "Internships"],
      domainPath: "/Career",
    }),
    { ...size },
  );
}
