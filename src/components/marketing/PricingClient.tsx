"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    Check,
    ChevronDown,
    Clock,
    RefreshCw,
    Link2,
    Mail,
    ArrowRight,
    Star,
} from "lucide-react";
import {
    CURRENCIES,
    formatAddOn,
    formatPrice,
    marketFor,
    noteFor,
    orderedCurrencies,
    type CurrencyCode,
    type PricingListData,
} from "@/lib/pricing/types";

const SITE_URL = "https://cdsspace.pro";

export function PricingClient({
    list,
    initialCurrency,
    locked = false,
}: {
    list: PricingListData;
    initialCurrency: CurrencyCode;
    /** When true (shared ?c=… link), lock to one currency and hide the toggle. */
    locked?: boolean;
}) {
    const currencies = useMemo(() => orderedCurrencies(list), [list]);
    const firstCurrency = currencies[0] ?? "ngn";
    const [currency, setCurrency] = useState<CurrencyCode>(
        currencies.includes(initialCurrency) ? initialCurrency : firstCurrency,
    );
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const [copied, setCopied] = useState(false);

    const meta = CURRENCIES[currency];
    const market = marketFor(list, currency);
    const note = noteFor(list, currency);
    // Show the switcher only in the internal (unlocked) view with 2+ currencies.
    const showToggle = !locked && currencies.length > 1;

    const shareUrl = useMemo(
        () => `${SITE_URL}/pricing/${list.slug}?c=${currency}`,
        [list.slug, currency],
    );

    // Internal preview: switch currency in local state only - never write ?c to
    // the URL, so navigating never turns the preview into a locked link.
    const changeCurrency = useCallback((c: CurrencyCode) => setCurrency(c), []);

    const toggle = useCallback((id: string) => {
        setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
    }, []);

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
                                {list.tagline}
                            </span>
                        )}
                        {list.effectiveDate && (
                            <>
                                <span className="hidden h-1 w-1 rounded-full bg-brand-stroke-ii md:inline-block" />
                                <span>Effective {list.effectiveDate}</span>
                            </>
                        )}
                        {list.email && (
                            <>
                                <span className="hidden h-1 w-1 rounded-full bg-brand-stroke-ii md:inline-block" />
                                <span>{list.email}</span>
                            </>
                        )}
                    </div>

                    {/* ===== Currency switcher + share ===== */}
                    <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        {showToggle ? (
                            <div className="w-full sm:w-auto">
                                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-mute">
                                    Currency
                                </span>
                                <div className="inline-flex w-full rounded-full border border-brand-stroke bg-white p-1 shadow-[0_8px_30px_rgba(15,40,90,0.05)] sm:w-auto">
                                    {currencies.map((c) => {
                                        const active = c === currency;
                                        return (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => changeCurrency(c)}
                                                aria-pressed={active}
                                                className={`flex-1 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-all active:scale-95 sm:flex-none md:text-[14px] ${
                                                    active ? "text-white shadow-md shadow-brand-blue/25" : "text-brand-body hover:text-brand-navy"
                                                }`}
                                                style={active ? { background: "linear-gradient(153.9deg, #0035C1 8.83%, #0575FF 86.3%)" } : undefined}
                                            >
                                                <span className="mr-1">{CURRENCIES[c].flag}</span>
                                                {CURRENCIES[c].symbol}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div />
                        )}

                        <div className="flex items-center gap-2.5">
                            <button
                                type="button"
                                onClick={copyLink}
                                className="inline-flex items-center gap-2 rounded-full border border-brand-stroke bg-white px-4 py-2.5 text-[13px] font-semibold text-brand-navy shadow-[0_8px_30px_rgba(15,40,90,0.05)] transition-all hover:border-brand-blue/40 active:scale-95 md:text-[14px]"
                            >
                                {copied ? <Check className="h-4 w-4 text-brand-success" /> : <Link2 className="h-4 w-4 text-brand-blue" />}
                                {copied ? "Link copied" : "Copy link"}
                            </button>
                            <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold text-white shadow-md shadow-brand-blue/25 transition-all active:scale-95 md:text-[14px]"
                                style={{ background: "linear-gradient(153.9deg, #0035C1 8.83%, #0575FF 86.3%)" }}
                            >
                                Share
                                <ArrowRight className="h-4 w-4" />
                            </a>
                        </div>
                    </div>

                    <p className="mt-3 text-[12px] font-medium text-brand-mute md:text-[13px]">
                        Showing prices in <span className="font-semibold text-brand-body">{meta.name} ({meta.symbol})</span>
                        {market ? <> - {market}.</> : "."}
                    </p>
                </div>
            </section>

            {/* ===== Client-facing note ===== */}
            {list.contextNote && (
                <section className="mx-auto w-full max-w-[1120px] px-5 md:px-8">
                    <div className="rounded-2xl border border-brand-stroke bg-white p-5 shadow-[0_8px_30px_rgba(15,40,90,0.05)] md:p-6">
                        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-blue">Client-facing note</p>
                        <p className="mt-2 text-[14px] font-medium leading-relaxed text-brand-body md:text-[15px]">{list.contextNote}</p>
                    </div>
                </section>
            )}

            {/* ===== Packages ===== */}
            <section className="mx-auto w-full max-w-[1120px] px-5 pt-10 md:px-8 md:pt-14">
                <SectionHeading index="01" title="Packages" subtitle="Tap a package to see full deliverables." />
                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
                    {list.packages.map((pkg, i) => {
                        const isOpen = !!open[pkg.id];
                        const amount = pkg.price?.amounts?.[currency];
                        const hasDetails = pkg.deliverables.length > 0 || !!pkg.notIncluded;
                        return (
                            <motion.div
                                key={pkg.id}
                                initial={{ opacity: 0, y: 16 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-40px" }}
                                transition={{ duration: 0.4, delay: (i % 2) * 0.05 }}
                                className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_10px_40px_rgba(15,40,90,0.06)] ${
                                    pkg.popular ? "border-brand-blue/40" : "border-brand-stroke"
                                }`}
                            >
                                {pkg.popular && (
                                    <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-brand-blue/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-blue">
                                        <Star className="h-3 w-3 fill-brand-blue" /> Most chosen
                                    </div>
                                )}
                                <div className="p-5 md:p-6">
                                    <h3 className="pr-24 text-[19px] font-semibold leading-tight tracking-[-0.01em] text-brand-navy md:text-[21px]">
                                        {pkg.name}
                                    </h3>
                                    {pkg.tagline && (
                                        <p className="mt-1.5 text-[13px] font-medium leading-snug text-brand-body md:text-[14px]">
                                            {pkg.tagline}
                                        </p>
                                    )}

                                    <div className="mt-4 flex items-baseline gap-1.5">
                                        {pkg.price?.from && amount && (
                                            <span className="text-[13px] font-semibold text-brand-mute">From</span>
                                        )}
                                        <span className="text-[26px] font-bold tracking-[-0.02em] text-brand-navy md:text-[30px]">
                                            {amount ? `${meta.symbol} ${amount}` : "On request"}
                                        </span>
                                    </div>

                                    {(pkg.timeline || pkg.revision) && (
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {pkg.timeline && <Chip icon={<Clock className="h-3.5 w-3.5" />}>{pkg.timeline}</Chip>}
                                            {pkg.revision && <Chip icon={<RefreshCw className="h-3.5 w-3.5" />}>{pkg.revision}</Chip>}
                                        </div>
                                    )}

                                    {pkg.bestFor && (
                                        <div className="mt-4 rounded-xl bg-brand-bg p-3">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-mute">Best for</p>
                                            <p className="mt-1 text-[13px] font-medium leading-snug text-brand-body">{pkg.bestFor}</p>
                                        </div>
                                    )}

                                    {hasDetails && (
                                        <button
                                            type="button"
                                            onClick={() => toggle(pkg.id)}
                                            aria-expanded={isOpen}
                                            className="mt-4 inline-flex w-full items-center justify-between rounded-xl border border-brand-stroke px-4 py-2.5 text-[13px] font-semibold text-brand-navy transition-colors hover:border-brand-blue/40 md:text-[14px]"
                                        >
                                            {isOpen ? "Hide deliverables" : "View deliverables"}
                                            <ChevronDown className={`h-4 w-4 text-brand-blue transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                        </button>
                                    )}
                                </div>

                                {isOpen && hasDetails && (
                                    <div className="border-t border-brand-stroke bg-white px-5 pb-5 pt-4 md:px-6">
                                        {pkg.deliverables.length > 0 && (
                                            <>
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-blue">Key deliverables</p>
                                                <ul className="mt-2.5 flex flex-col gap-2">
                                                    {pkg.deliverables.map((d, di) => (
                                                        <li key={di} className="flex gap-2.5">
                                                            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-success" />
                                                            <span className="text-[13px] font-medium leading-snug text-brand-body md:text-[13.5px]">{d}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </>
                                        )}
                                        {pkg.notIncluded && (
                                            <p className="mt-4 rounded-lg bg-brand-bg px-3 py-2.5 text-[12px] font-medium leading-snug text-brand-mute md:text-[12.5px]">
                                                <span className="font-semibold text-brand-body">Not included:</span> {pkg.notIncluded}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
                {note && <p className="mt-5 text-[12px] font-medium leading-relaxed text-brand-mute md:text-[13px]">{note}</p>}
            </section>

            {/* ===== Recommended path ===== */}
            {list.recommendedPaths.length > 0 && (
                <section className="mx-auto w-full max-w-[1120px] px-5 pt-12 md:px-8 md:pt-16">
                    <SectionHeading index="02" title="Recommended path" subtitle="Not sure where to start? Match your stage." />
                    <div className="mt-6 overflow-hidden rounded-2xl border border-brand-stroke bg-white shadow-[0_10px_40px_rgba(15,40,90,0.06)]">
                        {list.recommendedPaths.map((row, i) => (
                            <div key={i} className={`flex flex-col gap-1 p-4 md:flex-row md:items-center md:gap-6 md:p-5 ${i !== 0 ? "border-t border-brand-stroke" : ""}`}>
                                <p className="text-[14px] font-semibold text-brand-navy md:w-[42%] md:text-[15px]">{row.when}</p>
                                <p className="text-[13px] font-medium text-brand-body md:flex-1 md:text-[14px]">{row.choose}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ===== Add-ons ===== */}
            {list.addOns.length > 0 && (
                <section className="mx-auto w-full max-w-[1120px] px-5 pt-12 md:px-8 md:pt-16">
                    <SectionHeading index="03" title="Optional add-ons" subtitle="Confirm before work begins to avoid scope creep." />
                    <div className="mt-6 overflow-hidden rounded-2xl border border-brand-stroke bg-white shadow-[0_10px_40px_rgba(15,40,90,0.06)]">
                        <div className="hidden grid-cols-[1fr_auto] bg-brand-navy px-6 py-3.5 md:grid">
                            <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/80">Add-on service</span>
                            <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/80">Price</span>
                        </div>
                        {list.addOns.map((a, i) => (
                            <div key={i} className={`flex flex-col gap-1 px-4 py-3.5 md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-6 md:px-6 ${i !== 0 ? "border-t border-brand-stroke" : ""} ${i % 2 === 1 ? "md:bg-brand-bg/40" : ""}`}>
                                <span className="text-[14px] font-medium text-brand-navy md:text-[14.5px]">{a.name}</span>
                                <span className="text-[14px] font-bold text-brand-blue md:whitespace-nowrap md:text-right md:text-[14.5px]">{formatAddOn(a, currency)}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ===== Delivery process ===== */}
            {list.deliveryProcess.length > 0 && (
                <section className="mx-auto w-full max-w-[1120px] px-5 pt-12 md:px-8 md:pt-16">
                    <SectionHeading index="04" title="Delivery process" subtitle="How every project moves from brief to handover." />
                    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {list.deliveryProcess.map((step, i) => (
                            <div key={i} className="rounded-2xl border border-brand-stroke bg-white p-5 shadow-[0_8px_30px_rgba(15,40,90,0.05)]">
                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[14px] font-bold text-white" style={{ background: "linear-gradient(153.9deg, #0035C1 8.83%, #0575FF 86.3%)" }}>
                                    {i + 1}
                                </span>
                                <h4 className="mt-3 text-[15px] font-semibold text-brand-navy">{step.title}</h4>
                                <p className="mt-1 text-[13px] font-medium leading-snug text-brand-body">{step.detail}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ===== Payment, terms & scope ===== */}
            {list.terms.length > 0 && (
                <section className="mx-auto w-full max-w-[1120px] px-5 pt-12 md:px-8 md:pt-16">
                    <SectionHeading index="05" title="Payment, terms & scope" subtitle="Clear boundaries for a smooth engagement." />
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

            {/* ===== CTA ===== */}
            <section className="mx-auto w-full max-w-[1120px] px-5 py-14 md:px-8 md:py-20">
                <div className="relative overflow-hidden rounded-3xl px-6 py-10 text-center md:px-12 md:py-14" style={{ background: "linear-gradient(153.9deg, #0035C1 8.83%, #0575FF 86.3%)" }}>
                    <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
                    <h2 className="mx-auto max-w-[560px] text-[24px] font-semibold leading-tight tracking-[-0.02em] text-white md:text-[34px]">
                        Ready to build a brand that attracts the best?
                    </h2>
                    <p className="mx-auto mt-3 max-w-[520px] text-[14px] font-medium leading-relaxed text-white/85 md:text-[16px]">
                        Book a brand strategy call or request a formal proposal. We&apos;ll review your stage, market goals, and touchpoints before confirming scope.
                    </p>
                    <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <Link href="/consultation" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-[14px] font-semibold text-brand-navy transition-all hover:bg-white/90 active:scale-95 sm:w-auto md:text-[15px]">
                            Book a strategy call
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        {list.email && (
                            <a href={`mailto:${list.email}?subject=${encodeURIComponent(`${list.title} - Proposal request`)}`} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/40 px-6 py-3 text-[14px] font-semibold text-white transition-all hover:bg-white/10 active:scale-95 sm:w-auto md:text-[15px]">
                                <Mail className="h-4 w-4" />
                                {list.email}
                            </a>
                        )}
                    </div>
                </div>
            </section>
        </main>
    );
}

/* ---------- helpers ---------- */

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

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-stroke bg-white px-3 py-1.5 text-[12px] font-semibold text-brand-body">
            <span className="text-brand-blue">{icon}</span>
            {children}
        </span>
    );
}
