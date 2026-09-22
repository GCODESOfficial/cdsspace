import { ImageResponse } from "next/og";
import { OG_CONTENT_TYPE, OG_SIZE, renderSolidBlueCard } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "Sign in to CDS Space";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
    return new ImageResponse(
        await renderSolidBlueCard({
            eyebrow: "Login",
            title: "Welcome back to CDS Space",
            description: "Sign in securely to continue to your CDS Space account.",
        }),
        { ...size, fonts: getOgFonts() },
    );
}
