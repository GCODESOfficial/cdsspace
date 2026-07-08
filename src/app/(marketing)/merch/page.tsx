import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { MerchHero } from "@/components/marketing/MerchHero";
import { LazySection } from "@/components/marketing/LazySection";

const MerchGallery = dynamic(
    () => import("@/components/marketing/MerchGallery").then((m) => ({ default: m.MerchGallery })),
    {
        loading: () => (
            <div className="w-full py-24 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border-2 border-brand-blue/20 border-t-brand-blue animate-spin" />
            </div>
        ),
    },
);

export const metadata: Metadata = {
    title: "Custom Merch & Branded Products",
    description: "Explore CDS Space's custom merchandise and branded products - from T-shirts and aprons to rollup banners, cups, and packaging. High-quality branded merch for your business.",
    alternates: { canonical: "https://cdsspace.pro/merch" },
    openGraph: {
        title: "Custom Merch & Branded Products - CDS Space",
        description: "High-quality custom merchandise and branded products for businesses. T-shirts, banners, packaging, and more.",
        url: "https://cdsspace.pro/merch",
        type: "website",
    },
};

export default function MerchPage() {
    return (
        <main className="min-h-screen selection:bg-brand-blue selection:text-white bg-brand-bg relative">
            <MerchHero />

            <LazySection minHeight={720}>
                <MerchGallery />
            </LazySection>
        </main>
    );
}
