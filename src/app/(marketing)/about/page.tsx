import dynamic from "next/dynamic";
import { AboutHero } from "@/components/marketing/AboutHero";
import { LazySection } from "@/components/marketing/LazySection";

const SectionSkeleton = () => (
    <div className="w-full py-24 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-brand-blue/20 border-t-brand-blue animate-spin" />
    </div>
);

const Team = dynamic(() => import("@/components/marketing/Team").then((m) => ({ default: m.Team })), {
    loading: SectionSkeleton,
});
const Faqs = dynamic(() => import("@/components/marketing/Faqs").then((m) => ({ default: m.Faqs })), {
    loading: SectionSkeleton,
});

const ABOUT_DESCRIPTION =
    "CDS Space is a 24/7 branding and digital design agency connecting people, brands, and culture across Web2 and Web3. Meet the team shaping iconic brands - and come build with us: we're hiring talent and interns across design, engineering, and brand strategy.";

export const metadata = {
    title: "About Us - Our Team, Culture & Open Roles",
    description: ABOUT_DESCRIPTION,
    alternates: { canonical: "https://cdsspace.pro/about" },
    openGraph: {
        title: "About CDS Space - Our Team, Culture & Open Roles",
        description: ABOUT_DESCRIPTION,
        url: "https://cdsspace.pro/about",
        type: "website",
        siteName: "CDS Space",
        // images: auto-picked from ./opengraph-image.tsx
    },
    twitter: {
        card: "summary_large_image" as const,
        title: "About CDS Space - Our Team, Culture & Open Roles",
        description: ABOUT_DESCRIPTION,
        site: "@cdsspace_",
        creator: "@cdsspace_",
        // images: auto-picked from ./opengraph-image.tsx
    },
};

export default function AboutPage() {
    return (
        <main className="min-h-screen selection:bg-brand-blue selection:text-white bg-brand-bg">
            <AboutHero />
            <LazySection minHeight={760}>
                <Team />
            </LazySection>
            <LazySection minHeight={620}>
                <Faqs />
            </LazySection>
        </main>
    );
}
