import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { extractFromPdf } from "@/lib/pricing/extract";
import { extractionToNewList, matrixExtractionToNewList, mergeCurrencyIntoList } from "@/lib/pricing/merge";
import { getPricingListById } from "@/lib/pricing/server";
import { listKind, type PricingListKind } from "@/lib/pricing/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

/**
 * Upload a pricelist PDF → extract → return an UNSAVED, ready-to-review
 * PricingListData.
 *
 *   file    (required)  the PDF
 *   listId  (optional)  merge this currency into an existing list
 */
export async function POST(req: NextRequest) {
    const denied = await requireFinanceAdminAsync(req, "finance");
    if (denied) return denied;

    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid multipart form" }, { status: 400 });

    const file = form.get("file");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "File is empty" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 15 MB)" }, { status: 413 });

    const name = (file as File).name?.toLowerCase() ?? "";
    if (!name.endsWith(".pdf")) {
        return NextResponse.json({ error: "Only .pdf files are supported." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const listId = (form.get("listId") as string | null)?.trim() || "";

    // Kind comes from the form for new uploads; for a merge it follows the base.
    let base = null;
    if (listId) {
        base = await getPricingListById(listId);
        if (!base) return NextResponse.json({ error: "Target pricelist not found" }, { status: 404 });
    }
    const kind: PricingListKind = base
        ? listKind(base)
        : (form.get("kind") as string) === "matrix"
            ? "matrix"
            : "packages";

    if (listId && kind === "matrix") {
        return NextResponse.json(
            { error: "Adding a currency PDF isn't supported for table pricelists. Enable auto-convert instead to fill USD & RWF from NGN." },
            { status: 400 },
        );
    }

    let extraction;
    try {
        extraction = await extractFromPdf(buffer, kind);
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to read the PDF" },
            { status: 422 },
        );
    }

    const currency = extraction.currency;
    if (!currency) {
        return NextResponse.json(
            { error: "Could not detect the currency (NGN, USD, or RWF) in this document." },
            { status: 422 },
        );
    }

    const warnings = [...extraction.warnings];
    let report: string[] = [];
    let list;

    if (base) {
        if (base.currencies.includes(currency)) {
            warnings.push(`This list already has ${currency.toUpperCase()} - its amounts will be overwritten by this upload.`);
        }
        const merged = mergeCurrencyIntoList(base, extraction.data, currency);
        list = merged.list;
        report = merged.report;
    } else if (kind === "matrix") {
        list = matrixExtractionToNewList(extraction.data, currency);
    } else {
        list = extractionToNewList(extraction.data, currency);
    }

    return NextResponse.json({
        list,
        currency,
        method: extraction.method,
        confidence: extraction.confidence,
        warnings,
        report,
    });
}
