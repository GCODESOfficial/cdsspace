import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { BannerHero } from "@/components/marketing/BannerHero";
import { LazySection } from "@/components/marketing/LazySection";

const SectionSkeleton = () => (
    <div className="w-full py-24 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-brand-blue/20 border-t-brand-blue animate-spin" />
    </div>
);

const BannerGallery = dynamic(
    () => import("@/components/marketing/BannerGallery").then((m) => ({ default: m.BannerGallery })),
    { loading: SectionSkeleton },
);
const CTA = dynamic(() => import("@/components/marketing/CTA").then((m) => ({ default: m.CTA })), {
    loading: SectionSkeleton,
});

export const metadata: Metadata = {
    title: "Banner Design & Production",
    description: "Professional banner design and production services by CDS Space. Rollup banners, digital banners, event backdrops, and more for your brand's visual presence.",
    alternates: { canonical: "https://cdsspace.pro/banners" },
    openGraph: {
        title: "Banner Design & Production - CDS Space",
        description: "Professional banner design and production. Rollup banners, digital banners, and event backdrops.",
        url: "https://cdsspace.pro/banners",
        type: "website",
    },
};

export default function BannersPage() {
    return (
        <main className="min-h-screen selection:bg-brand-blue selection:text-white bg-brand-bg relative">
            <BannerHero />

            <LazySection minHeight={720}>
                <BannerGallery />
            </LazySection>

            <LazySection minHeight={520}>
                <CTA />
            </LazySection>
        </main>
    );
}
