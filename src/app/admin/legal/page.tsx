"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgePercent, FileSignature, FileText, Shield, ChevronRight, Loader2 } from "lucide-react";

type LegalSlug = "privacy" | "terms" | "brand-marketer-agreement";

interface DocRow {
    slug: LegalSlug;
    title: string;
    version: number;
    effective_date: string;
    updated_at: string;
    updated_by: string | null;
}

interface AgreementRow {
    id: string;
    user_id: string;
    public_user_id: string | null;
    user_email: string;
    user_full_name: string | null;
    company_name: string | null;
    terms_version: number;
    privacy_version: number;
    agreement_text: string;
    signed_at: string;
    ip_address: string | null;
}

interface MarketerAgreementRow {
    id: string;
    marketer_user_id: string;
    public_id: string | null;
    marketer_code: string | null;
    signer_name: string;
    signer_email: string;
    terms_version: number;
    privacy_version: number;
    marketer_agreement_version: number;
    signed_at: string;
    ip_address: string | null;
}

const DOCS: { slug: LegalSlug; label: string; description: string; icon: typeof FileText }[] = [
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
    {
        slug: "brand-marketer-agreement",
        label: "Brand Marketer Agreement",
        description:
            "The agreement governing marketer verification, code attribution, 5% commissions, payouts, conduct and CDS Space brand use.",
        icon: BadgePercent,
    },
];

export default function LegalDocsListPage() {
    const [rows, setRows] = useState<Record<string, DocRow | null>>({ privacy: null, terms: null, "brand-marketer-agreement": null });
    const [loading, setLoading] = useState(true);
    const [agreements, setAgreements] = useState<AgreementRow[]>([]);
    const [agreementsLoading, setAgreementsLoading] = useState(true);
    const [agreementsError, setAgreementsError] = useState<string | null>(null);
    const [marketerAgreements, setMarketerAgreements] = useState<MarketerAgreementRow[]>([]);

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

    useEffect(() => {
        fetch("/api/admin/legal/agreements", { cache: "no-store" })
            .then(async (response) => {
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.error || "Failed to load signed agreements.");
                setAgreements(result.agreements || []);
                setMarketerAgreements(result.marketerAgreements || []);
            })
            .catch((error) => setAgreementsError(error instanceof Error ? error.message : "Failed to load signed agreements."))
            .finally(() => setAgreementsLoading(false));
    }, []);

    return (
        <div className="p-8 max-w-[1100px]">
            <header className="mb-8">
                <h1 className="text-[28px] font-bold text-[#0D1B39] mb-2">Legal Documents</h1>
                <p className="text-gray-500 text-sm">
                    Edit the Privacy Policy, Terms of Service and Brand Marketer Agreement. Download as Word
                    (.docx), edit offline, and upload the revised file to publish changes.
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
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

            <section className="mt-10 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#0A4FE8]">
                            <FileSignature className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-[#0D1B39]">Signed user agreements</h2>
                            <p className="mt-1 text-xs text-gray-500">
                                One-time dashboard acceptance records tied to each authenticated user ID.
                            </p>
                        </div>
                    </div>
                    {!agreementsLoading && !agreementsError && (
                        <span className="rounded-full bg-[#EEF3FF] px-2.5 py-1 text-xs font-semibold text-[#0A4FE8]">
                            {agreements.length}
                        </span>
                    )}
                </div>

                {agreementsLoading ? (
                    <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading signed agreements...
                    </div>
                ) : agreementsError ? (
                    <p className="px-6 py-10 text-center text-sm text-red-500">{agreementsError}</p>
                ) : agreements.length === 0 ? (
                    <p className="px-6 py-10 text-center text-sm text-gray-500">No users have signed the dashboard agreement yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[920px] text-left">
                            <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                                <tr>
                                    <th className="px-6 py-3">User details</th>
                                    <th className="px-5 py-3">User ID</th>
                                    <th className="px-5 py-3">Accepted versions</th>
                                    <th className="px-5 py-3">Signed date and time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {agreements.map((agreement) => (
                                    <tr key={agreement.id} className="align-top text-sm">
                                        <td className="px-6 py-4">
                                            <p className="font-semibold text-[#0D1B39]">{agreement.user_full_name || "Name not provided"}</p>
                                            <p className="mt-0.5 text-xs text-gray-500">{agreement.user_email}</p>
                                            {agreement.company_name && <p className="mt-0.5 text-xs text-gray-400">{agreement.company_name}</p>}
                                        </td>
                                        <td className="px-5 py-4">
                                            <code className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] font-semibold tracking-[0.06em] text-gray-600" title={agreement.user_id}>
                                                {agreement.public_user_id || agreement.user_id}
                                            </code>
                                        </td>
                                        <td className="px-5 py-4 text-xs text-gray-600">
                                            <p>Terms v{agreement.terms_version}</p>
                                            <p className="mt-1">Privacy v{agreement.privacy_version}</p>
                                        </td>
                                        <td className="px-5 py-4 text-xs text-gray-600">
                                            <p className="font-medium text-[#0D1B39]">{new Date(agreement.signed_at).toLocaleDateString()}</p>
                                            <p className="mt-1">{new Date(agreement.signed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" })}</p>
                                            {agreement.ip_address && <p className="mt-1 text-gray-400">IP {agreement.ip_address}</p>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                            <BadgePercent className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-[#0D1B39]">Signed marketer agreements</h2>
                            <p className="mt-1 text-xs text-gray-500">Terms, privacy and marketer-programme acceptance tied to the marketer ID and code.</p>
                        </div>
                    </div>
                    {!agreementsLoading && !agreementsError && (
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{marketerAgreements.length}</span>
                    )}
                </div>
                {agreementsLoading ? (
                    <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading marketer agreements...</div>
                ) : marketerAgreements.length === 0 ? (
                    <p className="px-6 py-10 text-center text-sm text-gray-500">No marketers have signed all three documents yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[920px] text-left">
                            <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                                <tr><th className="px-6 py-3">Marketer</th><th className="px-5 py-3">ID and code</th><th className="px-5 py-3">Accepted versions</th><th className="px-5 py-3">Signed date and time</th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {marketerAgreements.map((agreement) => (
                                    <tr key={agreement.id} className="align-top text-sm">
                                        <td className="px-6 py-4"><p className="font-semibold text-[#0D1B39]">{agreement.signer_name}</p><p className="mt-0.5 text-xs text-gray-500">{agreement.signer_email}</p></td>
                                        <td className="px-5 py-4"><code className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-600">{agreement.public_id || agreement.marketer_user_id}</code>{agreement.marketer_code && <p className="mt-2 text-xs font-semibold text-violet-700">{agreement.marketer_code}</p>}</td>
                                        <td className="px-5 py-4 text-xs text-gray-600"><p>Terms v{agreement.terms_version}</p><p className="mt-1">Privacy v{agreement.privacy_version}</p><p className="mt-1">Marketer v{agreement.marketer_agreement_version}</p></td>
                                        <td className="px-5 py-4 text-xs text-gray-600"><p className="font-medium text-[#0D1B39]">{new Date(agreement.signed_at).toLocaleDateString()}</p><p className="mt-1">{new Date(agreement.signed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" })}</p>{agreement.ip_address && <p className="mt-1 text-gray-400">IP {agreement.ip_address}</p>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
