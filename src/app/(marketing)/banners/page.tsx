import type { Metadata } from "next";
import { BannerHero, BannerGallery, CTA } from "@/components/marketing";

export const metadata: Metadata = {
    title: "Banner Design & Production",
    description: "Professional banner design and production services by CDS Space. Rollup banners, digital banners, event backdrops, and more for your brand's visual presence.",
    alternates: { canonical: "https://cdsspace.pro/banners" },
    openGraph: {
        title: "Banner Design & Production — CDS Space",
        description: "Professional banner design and production. Rollup banners, digital banners, and event backdrops.",
        url: "https://cdsspace.pro/banners",
        type: "website",
        images: [{ url: "/navbar/CDS Logo.svg", width: 1200, height: 630, alt: "CDS Space Banner Design" }],
    },
};

export default function BannersPage() {
    return (
        <main className="min-h-screen selection:bg-brand-blue selection:text-white bg-brand-bg relative">
            <BannerHero />

            <BannerGallery />

            <CTA />
        </main>
    );
}
