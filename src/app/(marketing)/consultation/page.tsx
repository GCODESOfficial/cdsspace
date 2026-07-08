import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { ConsultationHero } from "@/components/marketing/ConsultationHero";
import { LazySection } from "@/components/marketing/LazySection";

const ConsultationForm = dynamic(
    () => import("@/components/marketing/ConsultationForm").then((m) => ({ default: m.ConsultationForm })),
    {
        loading: () => (
            <div className="w-full py-24 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border-2 border-brand-blue/20 border-t-brand-blue animate-spin" />
            </div>
        ),
    },
);

export const metadata: Metadata = {
    title: "Book a Brand Consultation",
    description: "Schedule a free brand consultation with CDS Space. Get expert advice on brand identity, design strategy, web development, and industrial print production for your business.",
    alternates: { canonical: "https://cdsspace.pro/consultation" },
    openGraph: {
        title: "Book a Brand Consultation - CDS Space",
        description: "Get expert branding advice. Schedule a consultation with our team of brand strategists and designers.",
        url: "https://cdsspace.pro/consultation",
        type: "website",
    },
};

export default function ConsultationPage() {
    return (
        <main className="min-h-screen selection:bg-brand-blue selection:text-white bg-brand-bg relative">
            <ConsultationHero />

            <LazySection minHeight={720}>
                <ConsultationForm />
            </LazySection>
        </main>
    );
}
