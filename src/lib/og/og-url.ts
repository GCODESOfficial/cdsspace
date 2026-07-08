/**
 * Helpers for building the OG image URL that goes into page metadata. Any
 * page can import this and drop a single URL into `openGraph.images[0].url`
 * without defining its own `opengraph-image.tsx`.
 *
 * Example:
 *   openGraph: { images: [{ url: brandOgUrl({ title: "About", pill: "Agency" }) }] }
 */

export const SITE_URL = "https://cdsspace.pro";

function qs(params: Record<string, string | null | undefined>): string {
    const out = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v == null || v === "") continue;
        out.set(k, v);
    }
    const s = out.toString();
    return s ? `?${s}` : "";
}

/**
 * Brand-card OG URL. Pass the `title`, optional `subtitle`, and an optional
 * `pill` (the status tag shown top-right of the sample template).
 */
export function brandOgUrl(opts: {
    title: string;
    subtitle?: string;
    pill?: string;
    base?: string;
}): string {
    const base = opts.base ?? SITE_URL;
    return `${base}/api/og${qs({
        title: opts.title,
        subtitle: opts.subtitle,
        pill: opts.pill,
    })}`;
}

/**
 * Invoice-card OG URL. Use for invoices that don't own their own
 * opengraph-image.tsx, or as a fallback for places that need a card without
 * looking up the invoice server-side.
 */
export function invoiceOgUrl(opts: {
    invoice: string;
    client: string;
    status?: "draft" | "sent" | "paid" | "overdue" | "cancelled";
    base?: string;
}): string {
    const base = opts.base ?? SITE_URL;
    return `${base}/api/og${qs({
        variant: "invoice",
        invoice: opts.invoice,
        client: opts.client,
        status: opts.status,
    })}`;
}

/**
 * Pricing-card OG URL. Pass the pricelist `slug` and a currency code
 * (`ngn` | `usd` | `rwf`) so the shared card lists that pricelist's packages
 * with prices in the requested currency.
 */
export function pricingOgUrl(opts: { slug: string; currency?: string; base?: string }): string {
    const base = opts.base ?? SITE_URL;
    return `${base}/api/og${qs({
        variant: "pricing",
        slug: opts.slug,
        c: (opts.currency || "ngn").toLowerCase(),
    })}`;
}

export function quotationOgUrl(opts: {
    quotation: string;
    project: string;
    client: string;
    status?: "draft" | "sent" | "accepted" | "converted" | "cancelled";
    base?: string;
}): string {
    const base = opts.base ?? SITE_URL;
    return `${base}/api/og${qs({
        variant: "quotation",
        quotation: opts.quotation,
        project: opts.project,
        client: opts.client,
        status: opts.status,
    })}`;
}
