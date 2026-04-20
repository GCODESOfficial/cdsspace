import type { Metadata } from "next";
import { ConsultationHero, ConsultationForm } from "@/components/marketing";

export const metadata: Metadata = {
    title: "Book a Brand Consultation",
    description: "Schedule a free brand consultation with CDS Space. Get expert advice on brand identity, design strategy, web development, and industrial print production for your business.",
    alternates: { canonical: "https://cdsspace.pro/consultation" },
    openGraph: {
        title: "Book a Brand Consultation — CDS Space",
        description: "Get expert branding advice. Schedule a consultation with our team of brand strategists and designers.",
        url: "https://cdsspace.pro/consultation",
        type: "website",
        images: [{ url: "/navbar/CDS Logo.svg", width: 1200, height: 630, alt: "CDS Space Consultation" }],
    },
};

export default function ConsultationPage() {
    return (
        <main className="min-h-screen selection:bg-brand-blue selection:text-white bg-brand-bg relative">
            <ConsultationHero />

            <ConsultationForm />
        </main>
    );
}