import { AboutHero, Team, Faqs } from "@/components/marketing";

const ABOUT_DESCRIPTION =
    "CDS Space is a 24/7 branding and digital design agency connecting people, brands, and culture across Web2 and Web3. Meet the team shaping iconic brands — and come build with us: we're hiring talent and interns across design, engineering, and brand strategy.";

export const metadata = {
    title: "About Us — Our Team, Culture & Open Roles",
    description: ABOUT_DESCRIPTION,
    alternates: { canonical: "https://cdsspace.pro/about" },
    openGraph: {
        title: "About CDS Space — Our Team, Culture & Open Roles",
        description: ABOUT_DESCRIPTION,
        url: "https://cdsspace.pro/about",
        type: "website",
        siteName: "CDS Space",
        // images: auto-picked from ./opengraph-image.tsx
    },
    twitter: {
        card: "summary_large_image" as const,
        title: "About CDS Space — Our Team, Culture & Open Roles",
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
            <Team />
            <Faqs />
        </main>
    );
}
