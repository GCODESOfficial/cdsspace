import { ImageResponse } from "next/og";
import { renderSolidBlueCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "About CDS Space - Our Team, Culture & Open Roles";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const fonts = getOgFonts();
  return new ImageResponse(
    await renderSolidBlueCard({
      eyebrow: "About",
      title: "About CDS Space",
      description:
        "Meet the people, culture, and thinking behind the home of best brands.",
    }),
    { ...size, fonts },
  );
}
