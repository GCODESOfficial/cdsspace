/**
 * OpenAI matrix extractor. Turns the plain text of a production/price-table
 * PDF into a structured single-currency matrix pricelist (rows × variants).
 */
import "server-only";
import {
    detectCurrency,
    slugify,
    type CurrencyCode,
    type MatrixData,
    type PricingListData,
} from "../types";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_PRICING_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = `You extract a TABULAR price list from the plain text of a PDF.
The table has rows (e.g. sizes) and several columns called "variants" (e.g. material/finish options like "Matte Finish", "Frameless").
Return ONLY JSON of this shape (no prose):
{
  "title": string,
  "subtitle": string,
  "effectiveDate": string,
  "email": string,
  "website": string,
  "currency": "ngn" | "usd" | "rwf",
  "contextNote": string,            // the overview / what the list covers
  "rowLabel": string,               // header of the first column, e.g. "Size (Inches)"
  "variants": string[],             // the column names, in order
  "rows": [
    { "label": string, "cells": [ { "variant": string, "amount": string, "note": string } ] }
    // amount = grouped digits only, e.g. "5,200" (no symbol). If a cell is not a price
    // (e.g. "Quote required"), put that phrase in "note" and leave "amount" "".
    // Include one cell per variant, in the same order as "variants".
  ],
  "notes": string[],                // footnotes under the table
  "orderProcess": [ { "title": string, "detail": string } ],  // recommended/order process steps
  "terms": [ { "label": string, "detail": string } ]          // payment/production terms
}
Keep wording faithful. Do not invent rows or variants.`;

interface AiCell { variant?: string; amount?: string; note?: string }
interface AiRow { label?: string; cells?: AiCell[] }
interface AiMatrixOut {
    title?: string; subtitle?: string; effectiveDate?: string; email?: string; website?: string;
    currency?: string; contextNote?: string; rowLabel?: string; variants?: string[]; rows?: AiRow[];
    notes?: string[]; orderProcess?: { title?: string; detail?: string }[]; terms?: { label?: string; detail?: string }[];
}

export function isOpenAiConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
}

export async function aiExtractMatrix(
    text: string,
): Promise<{ data: Partial<PricingListData>; currency: CurrencyCode }> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not configured");

    const res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: MODEL,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `PDF TEXT:\n\n${text.slice(0, 24000)}` },
            ],
        }),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`OpenAI matrix extraction failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned no content");

    let out: AiMatrixOut;
    try {
        out = JSON.parse(content);
    } catch {
        throw new Error("OpenAI returned non-JSON content");
    }

    const currency: CurrencyCode =
        (["ngn", "usd", "rwf"].includes((out.currency || "").toLowerCase())
            ? (out.currency!.toLowerCase() as CurrencyCode)
            : detectCurrency(text)) || "ngn";

    const variantNames = (out.variants ?? []).map((v) => v.trim()).filter(Boolean);
    const variants = variantNames.map((name) => ({ id: slugify(name), name }));
    const idByName = new Map(variants.map((v) => [v.name.toLowerCase(), v.id]));

    const rows = (out.rows ?? [])
        .filter((r) => r.label)
        .map((r) => {
            const cells: MatrixData["rows"][number]["cells"] = {};
            (r.cells ?? []).forEach((c, idx) => {
                const vid = idByName.get((c.variant || "").toLowerCase()) ?? variants[idx]?.id;
                if (!vid) return;
                const note = (c.note || "").trim();
                const amount = (c.amount || "").trim();
                cells[vid] = note ? { amounts: {}, note } : { amounts: { [currency]: amount } };
            });
            return { label: r.label!.trim(), cells };
        });

    const matrix: MatrixData = {
        rowLabel: (out.rowLabel || "Item").trim(),
        variants,
        rows,
        notes: (out.notes ?? []).map((n) => n.trim()).filter(Boolean),
    };

    const data: Partial<PricingListData> = {
        kind: "matrix",
        title: (out.title || "Pricing").trim(),
        subtitle: (out.subtitle || "").trim(),
        effectiveDate: (out.effectiveDate || "").trim(),
        email: (out.email || "").trim(),
        website: (out.website || "cdsspace.pro").trim(),
        contextNote: (out.contextNote || "").trim(),
        matrix,
        deliveryProcess: (out.orderProcess ?? [])
            .filter((s) => s.title)
            .map((s) => ({ title: s.title!.trim(), detail: (s.detail || "").trim() })),
        terms: (out.terms ?? [])
            .filter((t) => t.label && t.detail)
            .map((t) => ({ label: t.label!.trim(), detail: t.detail!.trim() })),
        currencyMeta: { [currency]: { market: "", note: "" } },
    };

    return { data, currency };
}
