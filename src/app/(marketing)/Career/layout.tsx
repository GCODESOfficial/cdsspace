import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Tech Careers — Join CDS Space",
    description: "Build your career at CDS Space, a unicorn branding agency. Mentorship, calm working space, faith-sensitive workplace, flexible schedules, and a creative team that matches global standards.",
    alternates: { canonical: "https://cdsspace.pro/career" },
    openGraph: {
        title: "Tech Careers — Join CDS Space",
        description: "Open roles at CDS Space. Mentorship, flexible schedules, faith-sensitive workplace, and a creative team that matches global standards.",
        url: "https://cdsspace.pro/career",
        type: "website",
    },
};

export default function CareerLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
