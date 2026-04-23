import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "CDS Space — Our Location";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const fonts = getOgFonts();
  return new ImageResponse(
    await renderBrandCard({
      eyebrow: "Come visit",
      title: "Our Studio",
      description:
        "Uyo, Nigeria — with remote teams across West Africa and partners worldwide.",
      tags: ["Uyo", "Nigeria", "Remote", "Worldwide"],
      domainPath: "/location",
    }),
    { ...size, fonts },
  );
}
