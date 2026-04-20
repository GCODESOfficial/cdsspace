import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Links — Connect with CDS Space",
    description: "Find all CDS Space social media links and contact channels. Follow us on Instagram, X (Twitter), TikTok, YouTube, Facebook, and WhatsApp.",
    alternates: { canonical: "https://cdsspace.pro/Links" },
    openGraph: {
        title: "Links — Connect with CDS Space",
        description: "All our social media and contact links in one place.",
        url: "https://cdsspace.pro/Links",
        type: "website",
    },
};

export default function LinksLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
