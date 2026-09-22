import { LegalShell } from "@/components/legal/LegalShell";
import { loadLegalDocument } from "@/lib/legal/server";

export const metadata = {
    title: "Anti-money laundering and counter-terrorist financing policy - CDS Space",
    description:
        "How CDS Space prevents, detects and reports money laundering, terrorist-financing, sanctions and related financial-crime risks.",
    alternates: { canonical: "https://cdsspace.pro/legal/aml-ctf-policy" },
    openGraph: {
        title: "AML/CTF policy - CDS Space",
        description:
            "CDS Space's anti-money laundering and counter-terrorist financing policy and SCUML registration statement.",
        url: "https://cdsspace.pro/legal/aml-ctf-policy",
        type: "website",
    },
    robots: { index: true, follow: true },
};

export const revalidate = 60;

export default async function AmlCtfPolicyPage() {
    const doc = await loadLegalDocument("aml-ctf-policy");

    return (
        <LegalShell
            title={doc.title}
            subtitle={doc.subtitle ?? undefined}
            effectiveDate={formatDate(doc.effective_date)}
            pdfSlug="aml-ctf-policy"
        >
            <div className="legal-prose" dangerouslySetInnerHTML={{ __html: doc.content }} />
        </LegalShell>
    );
}

function formatDate(value: string) {
    try {
        return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
        });
    } catch {
        return value;
    }
}
