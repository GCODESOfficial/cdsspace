/**
 * OpenAI fallback extractor. Turns the raw PDF text into a structured
 * single-currency pricelist when the deterministic parser isn't confident.
 *
 * Uses the OPENAI_API_KEY already configured in the environment. No SDK - a
 * single fetch to the Chat Completions API in JSON mode, then defensive
 * normalization into Partial<PricingListData>.
 */
import "server-only";
import {
    detectCurrency,
    slugify,
    type AddOn,
    type CurrencyCode,
    type PricingListData,
    type PricingPackage,
} from "../types";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_PRICING_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = `You extract a professional services pricelist from the plain text of a PDF.
Return ONLY JSON matching this shape (no prose):
{
  "title": string,
  "subtitle": string,
  "effectiveDate": string,           // e.g. "May 1, 2026"
  "email": string,
  "website": string,
  "tagline": string,                 // short slogan if present, else ""
  "market": string,                  // e.g. "Nigeria Market"
  "currency": "ngn" | "usd" | "rwf", // the ONE currency used in this document
  "contextNote": string,             // the client-facing note / scope paragraph
  "packages": [
    {
      "name": string,
      "tagline": string,             // one-line positioning, "" if none
      "amount": string,              // digits + grouping only, e.g. "230,000" or "180"
      "from": boolean,               // true if price is "From X"
      "bestFor": string,
      "timeline": string,
      "revision": string,
      "deliverables": string[],
      "notIncluded": string
    }
  ],
  "recommendedPaths": [ { "when": string, "choose": string } ],
  "addOns": [
    { "name": string, "amount": string, "from": boolean, "text": string }
    // For price add-ons set "amount" (+ "from"); leave "text" "".
    // For policy add-ons (e.g. "+30% to +50% of project fee", "15% of production budget or from NGN 250,000", "From NGN 1,000,000 per month") put the full phrase in "text" and leave "amount" "".
  ],
  "deliveryProcess": [ { "title": string, "detail": string } ],
  "terms": [ { "label": string, "detail": string } ]
}
Rules: keep wording faithful to the document. Amounts are grouped digits only (no currency symbol). If a field is missing use "" or []. Do not invent packages.`;

interface AiPackage {
    name?: string; tagline?: string; amount?: string; from?: boolean;
    bestFor?: string; timeline?: string; revision?: string;
    deliverables?: string[]; notIncluded?: string;
}
interface AiAddOn { name?: string; amount?: string; from?: boolean; text?: string }
interface AiOut {
    title?: string; subtitle?: string; effectiveDate?: string; email?: string;
    website?: string; tagline?: string; market?: string; currency?: string;
    contextNote?: string; packages?: AiPackage[];
    recommendedPaths?: { when?: string; choose?: string }[];
    addOns?: AiAddOn[]; deliveryProcess?: { title?: string; detail?: string }[];
    terms?: { label?: string; detail?: string }[];
}

export function isOpenAiConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
}

export async function aiExtractPricing(
    text: string,
): Promise<{ data: Partial<PricingListData>; currency: CurrencyCode }> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not configured");

    // Cap the text we send to keep the request bounded.
    const clipped = text.slice(0, 24000);

    const res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: MODEL,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `PDF TEXT:\n\n${clipped}` },
            ],
        }),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`OpenAI extraction failed (${res.status}): ${detail.slice(0, 300)}`);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned no content");

    let out: AiOut;
    try {
        out = JSON.parse(content);
    } catch {
        throw new Error("OpenAI returned non-JSON content");
    }

    const currency: CurrencyCode =
        (["ngn", "usd", "rwf"].includes((out.currency || "").toLowerCase())
            ? (out.currency!.toLowerCase() as CurrencyCode)
            : detectCurrency(text)) || "ngn";

    const packages: PricingPackage[] = (out.packages ?? [])
        .filter((p) => p.name && p.amount)
        .map((p) => ({
            id: slugify(p.name!),
            name: p.name!.trim(),
            tagline: (p.tagline || "").trim(),
            price: { from: !!p.from, amounts: { [currency]: (p.amount || "").trim() } },
            bestFor: (p.bestFor || "").trim(),
            timeline: (p.timeline || "").trim(),
            revision: (p.revision || "").trim(),
            deliverables: (p.deliverables ?? []).map((d) => d.trim()).filter(Boolean),
            notIncluded: (p.notIncluded || "").trim(),
        }));

    const addOns: AddOn[] = (out.addOns ?? [])
        .filter((a) => a.name)
        .map((a) => {
            const name = a.name!.trim();
            if (a.text && a.text.trim()) return { name, text: { [currency]: a.text.trim() } };
            return { name, price: { from: !!a.from, amounts: { [currency]: (a.amount || "").trim() } } };
        });

    const data: Partial<PricingListData> = {
        title: (out.title || "Pricing").trim(),
        subtitle: (out.subtitle || "").trim(),
        effectiveDate: (out.effectiveDate || "").trim(),
        email: (out.email || "").trim(),
        website: (out.website || "cdsspace.pro").trim(),
        tagline: (out.tagline || "Best attracts Best").trim(),
        contextNote: (out.contextNote || "").trim(),
        packages,
        recommendedPaths: (out.recommendedPaths ?? [])
            .filter((r) => r.when && r.choose)
            .map((r) => ({ when: r.when!.trim(), choose: r.choose!.trim() })),
        addOns,
        deliveryProcess: (out.deliveryProcess ?? [])
            .filter((s) => s.title)
            .map((s) => ({ title: s.title!.trim(), detail: (s.detail || "").trim() })),
        terms: (out.terms ?? [])
            .filter((t) => t.label && t.detail)
            .map((t) => ({ label: t.label!.trim(), detail: t.detail!.trim() })),
        currencyMeta: { [currency]: { market: (out.market || "").trim(), note: "" } },
    };

    return { data, currency };
}
