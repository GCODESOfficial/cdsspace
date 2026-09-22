import { ImageResponse } from "next/og";
import { OG_CONTENT_TYPE, OG_SIZE, renderSolidBlueCard } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "CDS Space Brand Marketers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
    return new ImageResponse(
        await renderSolidBlueCard({
            eyebrow: "Marketer",
            title: "CDS Space Brand Marketers",
            description: "Refer brands, track attributed invoices, and earn commissions.",
        }),
        { ...size, fonts: getOgFonts() },
    );
}
