import type { Metadata } from "next";

/**
 * Shared metadata shape for CDS Space sub-products (cMeet, cDocs, cSign, cResume).
 * Produces OG + Twitter card tags with a consistent brand image fallback.
 */
const SITE = "https://cdsspace.pro";
const FALLBACK_IMAGE = `${SITE}/mlogo.svg`;

export function buildProductMetadata(opts: {
    title: string;
    description: string;
    path: string;
    image?: string;
    imageAlt?: string;
    product: "cMeet" | "cDocs" | "cSign" | "cResume";
}): Metadata {
    const { title, description, path, image, imageAlt, product } = opts;
    const url = path.startsWith("http") ? path : `${SITE}${path}`;
    const imageUrl = image || FALLBACK_IMAGE;
    const ogTitle = `${title} · ${product} - CDS Space`;
    return {
        title: `${title} · ${product}`,
        description,
        alternates: { canonical: url },
        robots: { index: false, follow: false },
        openGraph: {
            title: ogTitle,
            description,
            url,
            type: "website",
            siteName: `CDS Space · ${product}`,
            images: [{ url: imageUrl, width: 1200, height: 630, alt: imageAlt || title }],
        },
        twitter: {
            card: "summary_large_image",
            title: ogTitle,
            description,
            images: [imageUrl],
            site: "@cdsspace_",
            creator: "@cdsspace_",
        },
    };
}

export function formatDateTime(iso?: string | null) {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        return d.toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "";
    }
}
