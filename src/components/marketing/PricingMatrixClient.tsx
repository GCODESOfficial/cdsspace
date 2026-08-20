"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, BadgeCheck, Link2, Mail, ArrowRight, Table2 } from "lucide-react";
import {
    CURRENCIES,
    formatCell,
    marketFor,
    noteFor,
    orderedCurrencies,
    type CurrencyCode,
    type PricingListData,
} from "@/lib/pricing/types";

const SITE_URL = "https://cdsspace.pro";
const ALL = "__all__";

/**
 * Tabular pricelist renderer. The client toggles a variant (material/finish)
 * to read prices per row (e.g. size), or switches to "All" to compare every
 * variant side by side. Shares the brand hero / currency-lock / share chrome
 * with the packages template but is a separate component so that template is
 * untouched.
 */
export function PricingMatrixClient({
    list,
    initialCurrency,
    locked = false,
}: {
    list: PricingListData;
    initialCurrency: CurrencyCode;
    locked?: boolean;
}) {
    const currencies = useMemo(() => orderedCurrencies(list), [list]);
    const firstCurrency = currencies[0] ?? "ngn";
    const [currency, setCurrency] = useState<CurrencyCode>(
        currencies.includes(initialCurrency) ? initialCurrency : firstCurrency,
    );
    const [copied, setCopied] = useState(false);

    const matrix = list.matrix;
    const variants = matrix?.variants ?? [];
    const [variantId, setVariantId] = useState<string>(variants[0]?.id ?? ALL);

    const meta = CURRENCIES[currency];
    const market = marketFor(list, currency);
    const note = noteFor(list, currency);
    const showToggle = !locked && currencies.length > 1;

    const shareUrl = useMemo(
        () => `${SITE_URL}/pricing/${list.slug}?c=${currency}`,
        [list.slug, currency],
    );

    const copyLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard unavailable */
        }
    }, [shareUrl]);

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
        `${list.title} - CDS Space (${meta.name}):\n${shareUrl}`,
    )}`;

    const showingAll = variantId === ALL || variants.length === 0;
    const activeVariant = variants.find((v) => v.id === variantId);

    return (
        <main className="min-h-screen bg-brand-bg selection:bg-brand-blue selection:text-white">
            {/* ===== Hero ===== */}
            <section className="relative overflow-hidden">
                <div
                    aria-hidden
                    className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-[0.12] blur-3xl"
                    style={{ background: "radial-gradient(circle, #0575FF 0%, transparent 70%)" }}
                />
                <div className="mx-auto w-full max-w-[1120px] px-5 pt-[120px] pb-8 md:px-8 md:pt-[150px] md:pb-12">
                    <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-blue md:text-[13px]">
                        Client Pricing
                    </p>
                    <h1 className="max-w-[760px] text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] text-brand-navy md:text-[46px] 2xl:text-[54px]">
                        {list.title}
                    </h1>
                    {list.subtitle && (
                        <p className="mt-4 max-w-[640px] text-[15px] font-medium leading-relaxed text-brand-body md:text-[17px]">
                            {list.subtitle}
                        </p>
                    )}

                    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-medium text-brand-mute md:text-[14px]">
                        {list.tagline && (
                            <span className="inline-flex items-center gap-1.5 font-semibold text-brand-blue">
                                <BadgeCheck className="h-4 w-4" /> {list.tagline}
                            </span>
                        )}
                        {list.effectiveDate && (
                            <>
                                <span className="hidden h-1 w-1 rounded-full bg-brand-stroke-ii md:inline-block" />
                                <span>{list.effectiveDate}</span>
                            </>
                        )}
                        {list.email && (
                            <>
                                <span className="hidden h-1 w-1 rounded-full bg-brand-stroke-ii md:inline-block" />
                                <span>{list.email}</span>
                            </>
                        )}
                    </div>

                    {/* Currency + share */}
                    <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        {showToggle ? (
                            <div className="w-full sm:w-auto">
                                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-mute">Currency</span>
                                <div className="inline-flex w-full rounded-full border border-brand-stroke bg-white p-1 shadow-[0_8px_30px_rgba(15,40,90,0.05)] sm:w-auto">
                                    {currencies.map((c) => {
                                        const active = c === currency;
                                        return (
                                            <button key={c} type="button" onClick={() => setCurrency(c)} aria-pressed={active}
                                                className={`flex-1 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-all active:scale-95 sm:flex-none md:text-[14px] ${active ? "text-white shadow-md shadow-brand-blue/25" : "text-brand-body hover:text-brand-navy"}`}
                                                style={active ? { background: "linear-gradient(153.9deg, #0035C1 8.83%, #0575FF 86.3%)" } : undefined}>
                                                <span className="mr-1">{CURRENCIES[c].flag}</span>{CURRENCIES[c].symbol}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div />
                        )}
                        <div className="flex items-center gap-2.5">
                            <button type="button" onClick={copyLink}
                                className="inline-flex items-center gap-2 rounded-full border border-brand-stroke bg-white px-4 py-2.5 text-[13px] font-semibold text-brand-navy shadow-[0_8px_30px_rgba(15,40,90,0.05)] transition-all hover:border-brand-blue/40 active:scale-95 md:text-[14px]">
                                {copied ? <Check className="h-4 w-4 text-brand-success" /> : <Link2 className="h-4 w-4 text-brand-blue" />}
                                {copied ? "Link copied" : "Copy link"}
                            </button>
                            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold text-white shadow-md shadow-brand-blue/25 transition-all active:scale-95 md:text-[14px]"
                                style={{ background: "linear-gradient(153.9deg, #0035C1 8.83%, #0575FF 86.3%)" }}>
                                Share<ArrowRight className="h-4 w-4" />
                            </a>
                        </div>
                    </div>

                    <p className="mt-3 text-[12px] font-medium text-brand-mute md:text-[13px]">
                        Showing prices in <span className="font-semibold text-brand-body">{meta.name} ({meta.symbol})</span>
                        {market ? <> - {market}.</> : "."}
                    </p>
                </div>
            </section>

            {/* Context note */}
            {list.contextNote && (
                <section className="mx-auto w-full max-w-[1120px] px-5 md:px-8">
                    <div className="rounded-2xl border border-brand-stroke bg-white p-5 shadow-[0_8px_30px_rgba(15,40,90,0.05)] md:p-6">
                        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-blue">Overview</p>
                        <p className="mt-2 text-[14px] font-medium leading-relaxed text-brand-body md:text-[15px]">{list.contextNote}</p>
                    </div>
                </section>
            )}

            {/* ===== Matrix ===== */}
            {matrix && matrix.rows.length > 0 && (
                <section className="mx-auto w-full max-w-[1120px] px-5 pt-10 md:px-8 md:pt-14">
                    <SectionHeading index="01" title="Price list" subtitle="Toggle the option to see its prices, or view all together." />

                    {/* Variant toggle */}
                    {variants.length > 0 && (
                        <div className="mt-6 flex flex-wrap gap-2">
                            {variants.map((v) => {
                                const active = v.id === variantId;
                                return (
                                    <button key={v.id} type="button" onClick={() => setVariantId(v.id)} aria-pressed={active}
                                        className={`rounded-full border px-4 py-2 text-[13px] font-semibold transition-all active:scale-95 md:text-[14px] ${active ? "border-transparent text-white shadow-md shadow-brand-blue/25" : "border-brand-stroke bg-white text-brand-body hover:text-brand-navy"}`}
                                        style={active ? { background: "linear-gradient(153.9deg, #0035C1 8.83%, #0575FF 86.3%)" } : undefined}>
                                        {v.name}
                                    </button>
                                );
                            })}
                            <button type="button" onClick={() => setVariantId(ALL)} aria-pressed={showingAll}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-semibold transition-all active:scale-95 md:text-[14px] ${showingAll ? "border-transparent bg-brand-navy text-white" : "border-brand-stroke bg-white text-brand-body hover:text-brand-navy"}`}>
                                <Table2 className="h-4 w-4" /> All
                            </button>
                        </div>
                    )}

                    {/* Table */}
                    <motion.div
                        key={showingAll ? "all" : variantId}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="mt-5 overflow-hidden rounded-2xl border border-brand-stroke bg-white shadow-[0_10px_40px_rgba(15,40,90,0.06)]"
                    >
                        {showingAll ? (
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-left">
                                    <thead>
                                        <tr className="bg-brand-navy">
                                            <th className="sticky left-0 z-10 bg-brand-navy px-4 py-3.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-white/85 md:px-6">
                                                {matrix.rowLabel || "Item"}
                                            </th>
                                            {variants.map((v) => (
                                                <th key={v.id} className="whitespace-nowrap px-4 py-3.5 text-right text-[12px] font-semibold uppercase tracking-[0.08em] text-white/85 md:px-6">
                                                    {v.name}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {matrix.rows.map((row, i) => (
                                            <tr key={i} className={i % 2 === 1 ? "bg-brand-bg/40" : ""}>
                                                <td className="sticky left-0 z-10 whitespace-nowrap border-t border-brand-stroke bg-inherit px-4 py-3 text-[14px] font-semibold text-brand-navy md:px-6" style={{ backgroundColor: i % 2 === 1 ? "#fbfcfe" : "#ffffff" }}>
                                                    {row.label}
                                                </td>
                                                {variants.map((v) => (
                                                    <td key={v.id} className="whitespace-nowrap border-t border-brand-stroke px-4 py-3 text-right text-[14px] font-bold text-brand-blue md:px-6">
                                                        {formatCell(row.cells[v.id], currency)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-[1fr_auto] bg-brand-navy px-4 py-3.5 md:px-6">
                                    <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/85">{matrix.rowLabel || "Item"}</span>
                                    <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/85">{activeVariant?.name}</span>
                                </div>
                                {matrix.rows.map((row, i) => (
                                    <div key={i} className={`grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3.5 md:px-6 ${i !== 0 ? "border-t border-brand-stroke" : ""} ${i % 2 === 1 ? "bg-brand-bg/40" : ""}`}>
                                        <span className="text-[14px] font-semibold text-brand-navy md:text-[15px]">{row.label}</span>
                                        <span className="text-right text-[14px] font-bold text-brand-blue md:text-[15px]">
                                            {formatCell(activeVariant ? row.cells[activeVariant.id] : undefined, currency)}
                                        </span>
                                    </div>
                                ))}
                            </>
                        )}
                    </motion.div>

                    {matrix.notes.length > 0 && (
                        <ul className="mt-4 flex flex-col gap-1.5">
                            {matrix.notes.map((n, i) => (
                                <li key={i} className="text-[12px] font-medium leading-relaxed text-brand-mute md:text-[13px]">{n}</li>
                            ))}
                        </ul>
                    )}
                    {note && <p className="mt-2 text-[12px] font-medium leading-relaxed text-brand-mute md:text-[13px]">{note}</p>}
                </section>
            )}

            {/* Order process (from recommendedPaths or deliveryProcess) */}
            {list.deliveryProcess.length > 0 && (
                <section className="mx-auto w-full max-w-[1120px] px-5 pt-12 md:px-8 md:pt-16">
                    <SectionHeading index="02" title="Order process" subtitle="How every order moves from brief to handover." />
                    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {list.deliveryProcess.map((step, i) => (
                            <div key={i} className="rounded-2xl border border-brand-stroke bg-white p-5 shadow-[0_8px_30px_rgba(15,40,90,0.05)]">
                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[14px] font-bold text-white" style={{ background: "linear-gradient(153.9deg, #0035C1 8.83%, #0575FF 86.3%)" }}>{i + 1}</span>
                                <h4 className="mt-3 text-[15px] font-semibold text-brand-navy">{step.title}</h4>
                                <p className="mt-1 text-[13px] font-medium leading-snug text-brand-body">{step.detail}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Terms */}
            {list.terms.length > 0 && (
                <section className="mx-auto w-full max-w-[1120px] px-5 pt-12 md:px-8 md:pt-16">
                    <SectionHeading index="03" title="Payment & production terms" subtitle="Clear boundaries for a smooth order." />
                    <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
                        {list.terms.map((t, i) => (
                            <div key={i} className="rounded-2xl border border-brand-stroke bg-white p-5 shadow-[0_8px_30px_rgba(15,40,90,0.05)]">
                                <p className="text-[14px] font-semibold text-brand-navy md:text-[15px]">{t.label}</p>
                                <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-brand-body md:text-[13.5px]">{t.detail}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* CTA */}
            <section className="mx-auto w-full max-w-[1120px] px-5 py-14 md:px-8 md:py-20">
                <div className="relative overflow-hidden rounded-3xl px-6 py-10 text-center md:px-12 md:py-14" style={{ background: "linear-gradient(153.9deg, #0035C1 8.83%, #0575FF 86.3%)" }}>
                    <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
                    <h2 className="mx-auto max-w-[560px] text-[24px] font-semibold leading-tight tracking-[-0.02em] text-white md:text-[34px]">Ready to place an order?</h2>
                    <p className="mx-auto mt-3 max-w-[520px] text-[14px] font-medium leading-relaxed text-white/85 md:text-[16px]">
                        Request a formal quotation or invoice to confirm size, finish, and quantity before production.
                    </p>
                    <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <Link href="/consultation" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-[14px] font-semibold text-brand-navy transition-all hover:bg-white/90 active:scale-95 sm:w-auto md:text-[15px]">
                            Request a quote<ArrowRight className="h-4 w-4" />
                        </Link>
                        {list.email && (
                            <a href={`mailto:${list.email}?subject=${encodeURIComponent(`${list.title} - Order request`)}`} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/40 px-6 py-3 text-[14px] font-semibold text-white transition-all hover:bg-white/10 active:scale-95 sm:w-auto md:text-[15px]">
                                <Mail className="h-4 w-4" />{list.email}
                            </a>
                        )}
                    </div>
                </div>
            </section>
        </main>
    );
}

function SectionHeading({ index, title, subtitle }: { index: string; title: string; subtitle: string }) {
    return (
        <div className="flex items-end justify-between gap-4">
            <div>
                <div className="flex items-center gap-2.5">
                    <span className="text-[12px] font-bold tracking-[0.1em] text-brand-blue">{index}</span>
                    <span className="h-px w-8 bg-brand-stroke-ii" />
                </div>
                <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-brand-navy md:text-[30px]">{title}</h2>
                <p className="mt-1 text-[13px] font-medium text-brand-body md:text-[15px]">{subtitle}</p>
            </div>
        </div>
    );
}
