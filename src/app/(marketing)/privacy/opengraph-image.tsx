import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";

export const runtime = "nodejs";
export const alt = "Privacy Policy — CDS Space";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return new ImageResponse(
    renderBrandCard({
      eyebrow: "Legal",
      title: "Privacy Policy",
      description:
        "How CDS Space collects, uses, and protects your information across our website and services.",
      tags: ["Privacy", "Data Protection", "Compliance"],
      domainPath: "/privacy",
    }),
    { ...size },
  );
}
