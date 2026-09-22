import { LegalShell } from "@/components/legal/LegalShell";
import { loadLegalDocument } from "@/lib/legal/server";

export const metadata = {
    title: "Privacy Policy - CDS Space",
    description:
        "How CDS Space collects, uses, and protects your personal data. Compliant with the Nigeria Data Protection Act 2023 and adapted for Rwanda, UK, EU, USA, and China.",
    alternates: { canonical: "https://cdsspace.pro/privacy" },
    openGraph: {
        title: "Privacy Policy - CDS Space",
        description: "How CDS Space collects, uses, and protects your personal data.",
        url: "https://cdsspace.pro/privacy",
        type: "website",
    },
    robots: { index: true, follow: true },
};

// ISR: regenerate the page at most once per minute so admin edits appear
// quickly without repeatedly querying GlashDB on every request.
export const revalidate = 60;

export default async function PrivacyPolicyPage() {
    const doc = await loadLegalDocument("privacy");

    return (
        <LegalShell
            title={doc.title}
            subtitle={doc.subtitle ?? undefined}
            effectiveDate={formatEffectiveDate(doc.effective_date)}
            pdfSlug="privacy"
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
