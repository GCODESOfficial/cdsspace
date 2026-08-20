import type { Metadata } from "next";
import IntelligenceLanding from "../blog/BlogLanding";

const description = "Research, audits, and market insights for businesses building the future.";

export const metadata: Metadata = {
    title: { absolute: "CDS Space Intelligence" },
    description,
    alternates: { canonical: "https://cdsspace.pro/intelligence" },
    openGraph: {
        title: "CDS Space Intelligence",
        description,
        url: "https://cdsspace.pro/intelligence",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "CDS Space Intelligence",
        description,
    },
};

export default function IntelligencePage() {
    return <IntelligenceLanding />;
}
