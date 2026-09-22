import React from "react";
import { Download } from "lucide-react";
import type { LegalSlug } from "@/lib/legal/default-content";

interface LegalShellProps {
    title: string;
    subtitle?: string;
    effectiveDate: string;
    pdfSlug?: LegalSlug;
    children: React.ReactNode;
}

export function LegalShell({ title, subtitle, effectiveDate, pdfSlug, children }: LegalShellProps) {
    return (
        <main className="min-h-screen bg-brand-bg selection:bg-brand-blue selection:text-white">
            <section className="pt-[140px] md:pt-[160px] 2xl:pt-[180px] pb-20 md:pb-28">
                <div className="mx-auto w-full max-w-[820px] px-5 md:px-8">
                    <header className="mb-12 md:mb-16 border-b border-brand-stroke/30 pb-8 md:pb-10">
                        <p className="text-brand-blue text-[13px] md:text-[14px] font-semibold mb-3">
                            Legal
                        </p>
                        <h1 className="text-brand-navy text-[32px] md:text-[44px] 2xl:text-[52px] font-semibold tracking-[-0.02em] leading-[1.1] mb-4">
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="text-brand-body text-[15px] md:text-[17px] font-medium leading-relaxed mb-4">
                                {subtitle}
                            </p>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <p className="text-brand-mute text-[13px] md:text-[14px] font-medium">
                                Effective date: {effectiveDate}
                            </p>
                            {pdfSlug && (
                                <a
                                    href={`/api/legal/${pdfSlug}/download`}
                                    download
                                    className="inline-flex items-center gap-2 rounded-xl border border-brand-stroke bg-white px-3.5 py-2 text-[13px] font-semibold text-brand-navy transition-colors hover:border-[#0A4FE8] hover:text-[#0A4FE8]"
                                >
                                    <Download className="h-4 w-4" aria-hidden="true" />
                                    Download PDF
                                </a>
                            )}
                        </div>
                    </header>

                    <article className="legal-prose text-brand-body text-[15px] md:text-[16px] leading-[1.75] font-medium">
                        {children}
                    </article>
                </div>
            </section>
        </main>
    );
}

interface SectionProps {
    id: string;
    title: string;
    children: React.ReactNode;
}

export function LegalSection({ id, title, children }: SectionProps) {
    return (
        <section id={id} className="mb-10 md:mb-12 scroll-mt-32">
            <h2 className="text-brand-navy text-[22px] md:text-[26px] 2xl:text-[28px] font-semibold tracking-[-0.01em] leading-tight mb-4 md:mb-5">
                {title}
            </h2>
            <div className="flex flex-col gap-4 md:gap-5">{children}</div>
        </section>
    );
}

interface SubSectionProps {
    title: string;
    children: React.ReactNode;
}

export function LegalSubsection({ title, children }: SubSectionProps) {
    return (
        <div>
            <h3 className="text-brand-navy text-[17px] md:text-[18px] font-semibold mb-2">
                {title}
            </h3>
            <div className="flex flex-col gap-3">{children}</div>
        </div>
    );
}

export function LegalList({ items }: { items: React.ReactNode[] }) {
    return (
        <ul className="list-disc pl-6 flex flex-col gap-2">
            {items.map((item, i) => (
                <li key={i}>{item}</li>
            ))}
        </ul>
    );
}
