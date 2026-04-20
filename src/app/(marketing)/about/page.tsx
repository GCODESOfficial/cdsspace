import { AboutHero, Team, Faqs } from "@/components/marketing";

export const metadata = {
    title: "About Us — Our Story, Values & Team",
    description: "Learn about CDS Space, a full-service branding agency driven by creativity and strategy. Meet our team of talented experts in brand identity, UI/UX design, web development, and industrial print.",
    alternates: { canonical: "https://cdsspace.pro/about" },
    openGraph: {
        title: "About CDS Space — Our Story, Values & Team",
        description: "Meet the team behind CDS Space. We help dreamers build iconic brands through strategy, design, and production.",
        url: "https://cdsspace.pro/about",
        type: "website",
        images: [{ url: "/navbar/CDS Logo.svg", width: 1200, height: 630, alt: "About CDS Space" }],
    },
    twitter: {
        card: "summary_large_image" as const,
        title: "About CDS Space — Our Story, Values & Team",
        description: "Meet the team behind CDS Space. We help dreamers build iconic brands.",
        images: ["/navbar/CDS Logo.svg"],
    },
};

export default function AboutPage() {
    return (
        <main className="min-h-screen selection:bg-brand-blue selection:text-white bg-brand-bg">
            <AboutHero />

            <Team />

            <Faqs />
        </main>
    );
}
