import { LegalShell } from "@/components/legal/LegalShell";
import { loadLegalDocument } from "@/lib/legal/server";

export const metadata = {
  title: "Brand Marketer Agreement - CDS Space",
  description: "The terms governing the CDS Space Brand Marketer Programme, referral attribution, commission and payouts.",
  alternates: { canonical: "https://cdsspace.pro/legal/brand-marketer-agreement" },
  robots: { index: true, follow: true },
};

export const revalidate = 60;

export default async function BrandMarketerAgreementPage() {
  const doc = await loadLegalDocument("brand-marketer-agreement");
  return (
    <LegalShell title={doc.title} subtitle={doc.subtitle ?? undefined} effectiveDate={formatDate(doc.effective_date)} pdfSlug="brand-marketer-agreement">
      <div className="legal-prose" dangerouslySetInnerHTML={{ __html: doc.content }} />
    </LegalShell>
  );
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return value;
  }
}
