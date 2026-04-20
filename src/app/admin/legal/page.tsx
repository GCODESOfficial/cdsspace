"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText, Shield, ChevronRight, Loader2 } from "lucide-react";

interface DocRow {
    slug: "privacy" | "terms";
    title: string;
    version: number;
    effective_date: string;
    updated_at: string;
    updated_by: string | null;
}

const DOCS: { slug: "privacy" | "terms"; label: string; description: string; icon: typeof FileText }[] = [
    {
        slug: "privacy",
        label: "Privacy Policy",
        description:
            "How CDS Space collects, uses, and protects personal data. Compliant with Nigeria NDPA 2023 and adapted for Rwanda, UK/EU, USA, and China.",
        icon: Shield,
    },
    {
        slug: "terms",
        label: "Terms of Service",
        description:
            "The terms that govern use of CDS Space websites, dashboards, and services. Governed by Nigerian law with consumer-protection overrides worldwide.",
        icon: FileText,
    },
];

export default function LegalDocsListPage() {
    const [rows, setRows] = useState<Record<string, DocRow | null>>({ privacy: null, terms: null });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all(
            DOCS.map(async (d) => {
                const res = await fetch(`/api/admin/legal/${d.slug}`);
                if (!res.ok) return [d.slug, null] as const;
                const json = await res.json();
                return [d.slug, json.document as DocRow] as const;
            })
        ).then((entries) => {
            setRows(Object.fromEntries(entries));
            setLoading(false);
        });
    }, []);

    return (
        <div className="p-8 max-w-[1100px]">
            <header className="mb-8">
                <h1 className="text-[28px] font-bold text-[#0D1B39] mb-2">Legal Documents</h1>
                <p className="text-gray-500 text-sm">
                    Edit the Privacy Policy and Terms of Service published on cdsspace.pro. Download as Word
                    (.docx), edit offline, and upload the revised file to publish changes.
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {DOCS.map(({ slug, label, description, icon: Icon }) => {
                    const row = rows[slug];
                    const isSeed = row?.version === 0;
                    return (
                        <Link
                            key={slug}
                            href={`/admin/legal/${slug}`}
                            className="group block bg-white border border-gray-200 rounded-2xl p-6 hover:border-[#0A4FE8] hover:shadow-[0_8px_24px_rgba(10,79,232,0.08)] transition-all"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-11 h-11 rounded-xl bg-[#EEF3FF] flex items-center justify-center text-[#0A4FE8]">
                                    <Icon className="w-5 h-5" />
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-[#0A4FE8] transition-colors" />
                            </div>

                            <h3 className="text-lg font-semibold text-[#0D1B39] mb-1.5">{label}</h3>
                            <p className="text-sm text-gray-500 leading-relaxed mb-5">{description}</p>

                            <div className="flex items-center gap-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                                {loading ? (
                                    <span className="flex items-center gap-1.5">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                                    </span>
                                ) : row ? (
                                    <>
                                        <span className="flex items-center gap-1.5">
                                            {isSeed ? (
                                                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium text-[11px]">
                                                    Default (unsaved)
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium text-[11px]">
                                                    v{row.version}
                                                </span>
                                            )}
                                        </span>
                                        <span>Effective {row.effective_date}</span>
                                        {row.updated_by && !isSeed && (
                                            <span className="truncate">by {row.updated_by}</span>
                                        )}
                                    </>
                                ) : (
                                    <span className="text-red-500">Failed to load</span>
                                )}
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
