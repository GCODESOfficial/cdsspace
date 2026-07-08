/**
 * Extraction orchestrator: PDF buffer → structured single-currency pricelist.
 *
 * Strategy (per product decision): run the deterministic template parser
 * first; if it isn't confident - or the OpenAI key is present and the parser
 * looks weak - fall back to the AI extractor. The parser result is used as-is
 * when AI isn't configured.
 */
import "server-only";
import type { CurrencyCode, PricingListData, PricingListKind } from "../types";
import { extractPdfText } from "./pdf-text";
import { parsePricingPdf } from "./parser";
import { aiExtractPricing, isOpenAiConfigured } from "./ai";
import { aiExtractMatrix } from "./ai-matrix";
import { parseMatrixPdf } from "./parser-matrix";

const CONFIDENCE_THRESHOLD = 0.7;

export interface ExtractionResult {
    data: Partial<PricingListData>;
    currency: CurrencyCode | null;
    method: "parser" | "ai";
    confidence: number;
    warnings: string[];
}

/** Route to the right extractor based on the requested template kind. */
export async function extractFromPdf(buffer: Buffer, kind: PricingListKind): Promise<ExtractionResult> {
    return kind === "matrix" ? extractMatrixFromPdf(buffer) : extractPricingFromPdf(buffer);
}

/**
 * Tabular extraction. Tables are hard for regex, so AI is preferred; the
 * deterministic parser is the fallback (generic variant names the admin can
 * rename).
 */
export async function extractMatrixFromPdf(buffer: Buffer): Promise<ExtractionResult> {
    const warnings: string[] = [];
    const text = await extractPdfText(buffer);
    if (!text.trim()) {
        throw new Error("Could not read any text from this PDF. If it is a scan, upload a text-based PDF.");
    }

    if (isOpenAiConfigured()) {
        try {
            const ai = await aiExtractMatrix(text);
            return { data: ai.data, currency: ai.currency, method: "ai", confidence: 0.9, warnings };
        } catch (e) {
            warnings.push(`AI extraction failed (${e instanceof Error ? e.message : "unknown error"}); used the built-in table parser. Please review carefully.`);
        }
    } else {
        warnings.push("OpenAI is not configured, so only the built-in table parser ran. Column names may be generic - rename them in the editor.");
    }

    const parsed = parseMatrixPdf(text);
    if (!parsed.data.matrix?.rows.length) {
        warnings.push("Couldn't read the table automatically - a blank matrix was created for you to fill in.");
    }
    return { data: parsed.data, currency: parsed.currency, method: "parser", confidence: parsed.confidence, warnings };
}

export async function extractPricingFromPdf(buffer: Buffer): Promise<ExtractionResult> {
    const warnings: string[] = [];
    const text = await extractPdfText(buffer);
    if (!text.trim()) {
        throw new Error("Could not read any text from this PDF. If it is a scan, upload a text-based PDF.");
    }

    const parsed = parsePricingPdf(text);

    const parserGoodEnough =
        parsed.confidence >= CONFIDENCE_THRESHOLD &&
        !!parsed.currency &&
        (parsed.data.packages?.length ?? 0) >= 4;

    if (parserGoodEnough) {
        return { data: parsed.data, currency: parsed.currency, method: "parser", confidence: parsed.confidence, warnings };
    }

    if (isOpenAiConfigured()) {
        try {
            const ai = await aiExtractPricing(text);
            return { data: ai.data, currency: ai.currency, method: "ai", confidence: 0.9, warnings };
        } catch (e) {
            warnings.push(
                `AI extraction failed (${e instanceof Error ? e.message : "unknown error"}); used the built-in parser instead. Please review carefully.`,
            );
            return { data: parsed.data, currency: parsed.currency, method: "parser", confidence: parsed.confidence, warnings };
        }
    }

    warnings.push("OpenAI is not configured, so only the built-in parser ran. Please review the result carefully.");
    return { data: parsed.data, currency: parsed.currency, method: "parser", confidence: parsed.confidence, warnings };
}
