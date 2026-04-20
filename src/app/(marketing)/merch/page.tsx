import type { Metadata } from "next";
import { MerchHero, MerchGallery } from "@/components/marketing";

export const metadata: Metadata = {
    title: "Custom Merch & Branded Products",
    description: "Explore CDS Space's custom merchandise and branded products — from T-shirts and aprons to rollup banners, cups, and packaging. High-quality branded merch for your business.",
    alternates: { canonical: "https://cdsspace.pro/merch" },
    openGraph: {
        title: "Custom Merch & Branded Products — CDS Space",
        description: "High-quality custom merchandise and branded products for businesses. T-shirts, banners, packaging, and more.",
        url: "https://cdsspace.pro/merch",
        type: "website",
        images: [{ url: "/navbar/CDS Logo.svg", width: 1200, height: 630, alt: "CDS Space Custom Merch" }],
    },
};

export default function MerchPage() {
    return (
        <main className="min-h-screen selection:bg-brand-blue selection:text-white bg-brand-bg relative">
            <MerchHero />

            <MerchGallery />
        </main>
    );
}
