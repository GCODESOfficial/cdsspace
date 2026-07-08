/**
 * Build/merge helpers for multi-currency pricelists.
 *
 * A pricelist is created from one currency's PDF, then additional currency
 * PDFs are merged in by matching packages and add-ons on their normalized
 * name, layering each currency's amount into the shared `amounts` map.
 */
import {
    CURRENCIES,
    CURRENCY_ORDER,
    slugify,
    type AddOn,
    type CurrencyCode,
    type PricingListData,
    type PricingPackage,
} from "./types";
import { BRAND_IDENTITY_SEED } from "./seed";
import { applyAutoConvertToList } from "./conversion";

function key(name: string): string {
    return slugify(name);
}

/**
 * Compose a brand-new (unsaved) pricelist from a single-currency extraction.
 *
 * Anything the extractor didn't return is backfilled from the CDS seed so the
 * editor is fully populated after an upload - the delivery process, terms,
 * recommended path, tagline, context note and contact details are the standard
 * CDS boilerplate (identical across the pricing PDFs), so they're safe defaults
 * the admin can tweak. When the source is NGN, auto-conversion is turned on so
 * USD (5×) and RWF fill in automatically.
 */
export function extractionToNewList(
    extract: Partial<PricingListData>,
    currency: CurrencyCode,
): PricingListData {
    const seed = BRAND_IDENTITY_SEED;
    const now = new Date().toISOString();
    const title = extract.title?.trim() || "Pricing";
    const market = extract.currencyMeta?.[currency]?.market || CURRENCIES[currency].market;
    const list: PricingListData = {
        id: "",
        slug: slugify(title),
        title,
        subtitle: extract.subtitle?.trim() || seed.subtitle,
        currencies: [currency],
        currencyMeta: {
            [currency]: {
                market,
                note: extract.currencyMeta?.[currency]?.note || "",
            },
        },
        preparedBy: extract.preparedBy?.trim() || seed.preparedBy,
        website: extract.website?.trim() || seed.website,
        email: extract.email?.trim() || seed.email,
        effectiveDate: extract.effectiveDate?.trim() || seed.effectiveDate,
        tagline: extract.tagline?.trim() || seed.tagline,
        contextNote: extract.contextNote?.trim() || seed.contextNote,
        packages: (extract.packages || []).map((p) => ({ ...p, id: p.id || key(p.name) })),
        recommendedPaths: extract.recommendedPaths?.length ? extract.recommendedPaths : seed.recommendedPaths,
        addOns: extract.addOns || [],
        deliveryProcess: extract.deliveryProcess?.length ? extract.deliveryProcess : seed.deliveryProcess,
        terms: extract.terms?.length ? extract.terms : seed.terms,
        autoConvert: false,
        published: false,
        createdAt: now,
        updatedAt: now,
    };
    // Auto-conversion on by default for NGN-sourced lists → fills USD & RWF.
    return currency === "ngn" ? applyAutoConvertToList(list) : list;
}

/** Compose a brand-new (unsaved) matrix pricelist from a table extraction. */
export function matrixExtractionToNewList(
    extract: Partial<PricingListData>,
    currency: CurrencyCode,
): PricingListData {
    const now = new Date().toISOString();
    const title = extract.title?.trim() || "Pricing";
    const list: PricingListData = {
        id: "",
        slug: slugify(title),
        title,
        kind: "matrix",
        subtitle: extract.subtitle?.trim() || "",
        currencies: [currency],
        currencyMeta: {
            [currency]: {
                market: extract.currencyMeta?.[currency]?.market || CURRENCIES[currency].market,
                note: extract.currencyMeta?.[currency]?.note || "",
            },
        },
        preparedBy: extract.preparedBy?.trim() || "CDS Space",
        website: extract.website?.trim() || "cdsspace.pro",
        email: extract.email?.trim() || "support@cdsspace.pro",
        effectiveDate: extract.effectiveDate?.trim() || "",
        tagline: extract.tagline?.trim() || "Best attracts Best",
        contextNote: extract.contextNote?.trim() || "",
        packages: [],
        matrix: extract.matrix ?? { rowLabel: "Item", variants: [], rows: [], notes: [] },
        recommendedPaths: extract.recommendedPaths || [],
        addOns: [],
        deliveryProcess: extract.deliveryProcess || [],
        terms: extract.terms || [],
        autoConvert: false,
        published: false,
        createdAt: now,
        updatedAt: now,
    };
    return currency === "ngn" ? applyAutoConvertToList(list) : list;
}

/**
 * Merge a single-currency extraction into an existing list. Amounts for the
 * new currency are layered onto matching packages/add-ons (matched by name);
 * unmatched items are appended so nothing is silently dropped. Structural copy
 * (deliverables, terms, process) from the base list is preserved.
 */
export function mergeCurrencyIntoList(
    base: PricingListData,
    extract: Partial<PricingListData>,
    currency: CurrencyCode,
): { list: PricingListData; report: string[] } {
    const report: string[] = [];
    const list: PricingListData = structuredClone(base);

    // Register the currency.
    if (!list.currencies.includes(currency)) {
        list.currencies = CURRENCY_ORDER.filter(
            (c) => list.currencies.includes(c) || c === currency,
        );
    }
    list.currencyMeta = {
        ...list.currencyMeta,
        [currency]: {
            market: extract.currencyMeta?.[currency]?.market || CURRENCIES[currency].market,
            note: extract.currencyMeta?.[currency]?.note || list.currencyMeta?.[currency]?.note || "",
        },
    };

    // Packages.
    const pkgByKey = new Map<string, PricingPackage>(list.packages.map((p) => [key(p.name), p]));
    let matched = 0;
    let appended = 0;
    for (const inc of extract.packages || []) {
        const k = key(inc.name);
        const amount = inc.price?.amounts?.[currency];
        const existing = pkgByKey.get(k);
        if (existing) {
            existing.price = existing.price || { amounts: {} };
            if (amount) existing.price.amounts[currency] = amount;
            if (inc.price?.from) existing.price.from = true;
            matched++;
        } else {
            const np: PricingPackage = { ...inc, id: inc.id || k };
            list.packages.push(np);
            pkgByKey.set(k, np);
            appended++;
        }
    }
    report.push(`Packages: ${matched} matched, ${appended} added.`);

    // Add-ons.
    const addonByKey = new Map<string, AddOn>(list.addOns.map((a) => [key(a.name), a]));
    let aMatched = 0;
    let aAppended = 0;
    for (const inc of extract.addOns || []) {
        const k = key(inc.name);
        const existing = addonByKey.get(k);
        if (existing) {
            if (inc.text?.[currency]) {
                existing.text = { ...(existing.text || {}), [currency]: inc.text[currency] };
            } else if (inc.price?.amounts?.[currency]) {
                existing.price = existing.price || { amounts: {} };
                existing.price.amounts[currency] = inc.price.amounts[currency];
                if (inc.price.from) existing.price.from = true;
            }
            aMatched++;
        } else {
            list.addOns.push({ ...inc });
            addonByKey.set(k, { ...inc });
            aAppended++;
        }
    }
    report.push(`Add-ons: ${aMatched} matched, ${aAppended} added.`);

    list.updatedAt = new Date().toISOString();
    return { list, report };
}
