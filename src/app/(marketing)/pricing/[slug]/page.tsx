import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PricingClient } from "@/components/marketing/PricingClient";
import { PricingMatrixClient } from "@/components/marketing/PricingMatrixClient";
import { pricingOgUrl } from "@/lib/og/og-url";
import { getPricingListBySlug } from "@/lib/pricing/server";
import { CURRENCIES, listKind, normalizeCurrency, orderedCurrencies } from "@/lib/pricing/types";

const SITE_URL = "https://cdsspace.pro";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ c?: string }>;

// Regenerate at most once a minute so admin edits appear quickly.
export const revalidate = 60;

export async function generateMetadata({
    params,
    searchParams,
}: {
    params: Params;
    searchParams: SearchParams;
}): Promise<Metadata> {
    const { slug } = await params;
    const { c } = await searchParams;
    const list = await getPricingListBySlug(slug);
    if (!list) return { title: "Pricing - CDS Space", robots: { index: false, follow: false } };

    const present = orderedCurrencies(list);
    const wanted = normalizeCurrency(c);
    const currency = present.includes(wanted) ? wanted : present[0] ?? "ngn";
    const meta = CURRENCIES[currency];

    const title = `${list.title} - CDS Space (${meta.symbol})`;
    const description =
        list.subtitle ||
        `CDS Space ${list.title} priced in ${meta.name}. ${list.tagline || "Best attracts Best."}`;
    const url = `${SITE_URL}/pricing/${list.slug}?c=${currency}`;
    const ogImage = pricingOgUrl({ slug: list.slug, currency });

    return {
        title,
        description,
        alternates: { canonical: url },
        // Private client pricelist - shareable by direct link, kept out of search.
        robots: { index: false, follow: false },
        openGraph: {
            title,
            description,
            url,
            siteName: "CDS Space",
            type: "website",
            images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
        },
        twitter: { card: "summary_large_image", title, description, images: [ogImage] },
    };
}

export default async function PricingListPage({
    params,
    searchParams,
}: {
    params: Params;
    searchParams: SearchParams;
}) {
    const { slug } = await params;
    const { c } = await searchParams;
    const list = await getPricingListBySlug(slug);
    if (!list || !list.published) notFound();

    const present = orderedCurrencies(list);
    const wanted = normalizeCurrency(c);
    const hasExplicit = !!c && present.includes(wanted);
    const currency = hasExplicit ? wanted : present[0] ?? "ngn";

    // A shared link with an explicit ?c=<currency> locks the client to that
    // single currency - no toggle, and the other currencies aren't exposed.
    if (listKind(list) === "matrix") {
        return <PricingMatrixClient list={list} initialCurrency={currency} locked={hasExplicit} />;
    }
    return <PricingClient list={list} initialCurrency={currency} locked={hasExplicit} />;
}
