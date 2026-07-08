import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listPricingLists } from "@/lib/pricing/server";
import { CURRENCIES, formatPrice, orderedCurrencies } from "@/lib/pricing/types";

export const revalidate = 60;

export const metadata: Metadata = {
    title: "Pricing - CDS Space",
    description: "CDS Space client pricelists.",
    alternates: { canonical: "https://cdsspace.pro/pricing" },
    // Directory of private pricelists - kept out of search.
    robots: { index: false, follow: false },
};

export default async function PricingIndexPage() {
    const lists = await listPricingLists({ publishedOnly: true });

    return (
        <main className="min-h-screen bg-brand-bg selection:bg-brand-blue selection:text-white">
            <section className="mx-auto w-full max-w-[1120px] px-5 pt-[120px] pb-20 md:px-8 md:pt-[150px] md:pb-28">
                <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-blue md:text-[13px]">
                    Client Pricing
                </p>
                <h1 className="max-w-[720px] text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] text-brand-navy md:text-[46px]">
                    Our pricelists
                </h1>
                <p className="mt-4 max-w-[600px] text-[15px] font-medium leading-relaxed text-brand-body md:text-[17px]">
                    Transparent, package-based pricing. Open a list to view scope, timelines, and add-ons - and switch currency where available.
                </p>

                {lists.length === 0 ? (
                    <p className="mt-10 text-[15px] font-medium text-brand-mute">No pricelists published yet.</p>
                ) : (
                    <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
                        {lists.map((list) => {
                            const currencies = orderedCurrencies(list);
                            const currency = currencies[0] ?? "ngn";
                            const isMatrix = list.kind === "matrix";
                            const cheapest = list.packages
                                .map((p) => p.price?.amounts?.[currency])
                                .find(Boolean);
                            const fromPrice = list.packages[0]
                                ? formatPrice(list.packages[0].price, currency)
                                : "";
                            const summary = isMatrix
                                ? `${list.matrix?.rows?.length ?? 0} sizes · ${list.matrix?.variants?.length ?? 0} options`
                                : `${list.packages.length} packages${cheapest ? ` · from ${fromPrice}` : ""}`;
                            return (
                                <Link
                                    key={list.id}
                                    href={`/pricing/${list.slug}`}
                                    className="group flex flex-col rounded-2xl border border-brand-stroke bg-white p-6 shadow-[0_10px_40px_rgba(15,40,90,0.06)] transition-all hover:border-brand-blue/40 hover:shadow-[0_16px_50px_rgba(15,40,90,0.1)]"
                                >
                                    <div className="flex items-center gap-2">
                                        {currencies.map((c) => (
                                            <span key={c} className="rounded-full bg-brand-bg px-2.5 py-1 text-[11px] font-bold text-brand-body">
                                                {CURRENCIES[c].flag} {CURRENCIES[c].symbol}
                                            </span>
                                        ))}
                                    </div>
                                    <h2 className="mt-4 text-[20px] font-semibold leading-tight tracking-[-0.01em] text-brand-navy md:text-[22px]">
                                        {list.title}
                                    </h2>
                                    {list.subtitle && (
                                        <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug text-brand-body md:text-[14px]">
                                            {list.subtitle}
                                        </p>
                                    )}
                                    <div className="mt-5 flex items-center justify-between">
                                        <span className="text-[13px] font-medium text-brand-mute">
                                            {summary}
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-blue">
                                            View <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                        </span>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </section>
        </main>
    );
}
