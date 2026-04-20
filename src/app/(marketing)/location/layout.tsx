import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Our Location — Visit CDS Space in Uyo",
    description: "Find CDS Space's office in Uyo, Nigeria. Visit us for branding consultations, design services, and industrial print production.",
    alternates: { canonical: "https://cdsspace.pro/location" },
    openGraph: {
        title: "Our Location — Visit CDS Space in Uyo",
        description: "Find our office in Uyo, Nigeria for branding and design services.",
        url: "https://cdsspace.pro/location",
        type: "website",
    },
};

export default function LocationLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
