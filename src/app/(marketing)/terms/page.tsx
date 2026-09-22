import { LegalShell } from "@/components/legal/LegalShell";
import { loadLegalDocument } from "@/lib/legal/server";

export const metadata = {
    title: "Terms of Service - CDS Space",
    description:
        "The terms that govern your use of CDS Space websites, dashboards, and services. Governed by Nigerian law and adapted for users in Rwanda, the UK, USA, China, and worldwide.",
    alternates: { canonical: "https://cdsspace.pro/terms" },
    openGraph: {
        title: "Terms of Service - CDS Space",
        description: "The terms that govern your use of CDS Space websites, dashboards, and services.",
        url: "https://cdsspace.pro/terms",
        type: "website",
    },
    robots: { index: true, follow: true },
};

export const revalidate = 60;

export default async function TermsOfServicePage() {
    const doc = await loadLegalDocument("terms");

    return (
        <LegalShell
            title={doc.title}
            subtitle={doc.subtitle ?? undefined}
            effectiveDate={formatEffectiveDate(doc.effective_date)}
            pdfSlug="terms"
        >
            <div className="legal-prose" dangerouslySetInnerHTML={{ __html: doc.content }} />
        </LegalShell>
    );
}

function formatEffectiveDate(iso: string) {
    try {
        return new Date(iso).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
        });
    } catch {
        return iso;
    }
}
