import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Our Work - Brand Identity & Design Portfolio",
    description: "Explore CDS Space's portfolio of brand identity, packaging design, and visual branding projects. See how we've helped brands like Ofada Connoisseur and Valse Tea build iconic identities.",
    alternates: { canonical: "https://cdsspace.pro/work" },
    openGraph: {
        title: "Our Work - CDS Space Design Portfolio",
        description: "Brand identity, packaging, and visual branding portfolio. See our latest projects and case studies.",
        url: "https://cdsspace.pro/work",
        type: "website",
    },
};

export default function WorkLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
