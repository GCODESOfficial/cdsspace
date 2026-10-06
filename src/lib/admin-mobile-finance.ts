import "server-only";

import jsPDF from "jspdf";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";
import { patchDocText } from "@/lib/pdf/pdf-i18n";
import { POST as translateTexts } from "@/app/api/translate/route";
import { loadServerPdfImage } from "@/lib/finance/invoice-pdf-server";
import type { FinanceQuotation, FinanceQuotationItem, FinanceQuotationSample } from "@/lib/finance/types";
import {
    DEFAULT_QUOTATION_ESTIMATE_NOTE,
    DEFAULT_REVISIONS_NOTE,
    DEFAULT_WORKING_HOURS,
    formatFinanceDate,
} from "@/lib/finance/types";

/**
 * Admin app (finance): the quotation PDF built on the server, so the app can show
 * it in its native PDF viewer. A server copy of src/lib/quotation-pdf.ts
 * (exportQuotationToPdf), which only runs in the browser: same layout, with
 * images read through loadServerPdfImage and the document returned instead of
 * downloaded. The fixed labels are translated like the browser's localizePdfLabels
 * when a language is given (the app passes the admin's device language), through
 * the same /api/translate handler and its shared translation cache.
 */

// NGN is written as its code: the PDF fonts cannot draw ₦, and a bare "N"
// reads as a typo. Matches the Executive Board documents.
const CURRENCY_SYMBOLS: Record<string, string> = { NGN: "NGN ", USD: "$", GBP: "GBP ", EUR: "EUR ", RWF: "RWF ", CNY: "CNY ", AED: "AED " };

function fmtMoney(n: number | string | null | undefined, currency: string) {
    const v = Number(n || 0);
    const sym = CURRENCY_SYMBOLS[currency] ?? "";
    return `${sym}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null | undefined) {
    return formatFinanceDate(iso, { year: "numeric", month: "short", day: "numeric" });
}

function host(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

/** Server version of localizePdfLabels: translate the fixed labels into `lang` (no-op for English). */
async function localizeLabels(doc: jsPDF, lang: string | null | undefined, labels: string[]) {
    const target = String(lang || "").trim().toLowerCase();
    if (!target || target === "en" || !/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(target)) return;
    try {
        const res = await translateTexts(
            new Request("http://internal/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ q: labels, source: "en", target }),
            }),
        );
        if (!res.ok) return;
        const { translations } = (await res.json()) as { translations?: unknown[] };
        const map: Record<string, string> = {};
        labels.forEach((label, i) => {
            const t = translations?.[i];
            if (typeof t === "string" && t && t !== label) map[label] = t;
        });
        patchDocText(doc as unknown as { text: (...args: unknown[]) => unknown }, map);
    } catch {
        // English labels are a fine fallback.
    }
}

export async function buildQuotationPdf(
    quotation: FinanceQuotation,
    items: FinanceQuotationItem[],
    samples: FinanceQuotationSample[] = [],
    options: { lang?: string | null } = {},
) {
    const imageSamples = samples.filter((s) => s.kind === "image").slice(0, 6);
    const [logoImg, sealImg, ...sampleImgs] = await Promise.all([
        loadServerPdfImage("/navbar/CDS Logo.svg", 256),
        loadServerPdfImage("/CDS_Seal.png"),
        ...imageSamples.map((sample) => loadServerPdfImage(sample.url, 300)),
    ]);

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    installBrandFont(doc);
    await localizeLabels(doc, options.lang, [
        "Branding & Digital Agency", "QUOTATION", "ESTIMATE", "Estimate Details",
        "ISSUED / VALIDITY", "PREPARED FOR", "PROJECT / COMPANY", "ITEM", "QTY",
        "UNIT PRICE", "NOTES", "Sample References",
    ]);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    const innerWidth = pageWidth - margin * 2;
    const currency = quotation.currency || "NGN";
    let y = margin + 8;

    const ensureSpace = (needed: number) => {
        if (y + needed > pageHeight - 70) {
            doc.addPage();
            y = margin;
        }
    };

    const headerTop = y;
    const logoH = 32;
    const logoW = logoImg ? (logoImg.width / logoImg.height) * logoH : logoH * 2.5;
    let textLeft = margin;
    if (logoImg) {
        try {
            doc.addImage(logoImg.data, logoImg.format, margin, headerTop + 4, logoW, logoH);
            textLeft = margin + logoW + 14;
        } catch {}
    }
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(16);
    doc.setTextColor(13, 27, 57);
    doc.text("CDS Space", textLeft, headerTop + 18);
    doc.setFont("NeueCampton", "normal");
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text("Branding & Digital Agency", textLeft, headerTop + 34);

    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text("QUOTATION", pageWidth - margin, headerTop + 10, { align: "right" });
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(20);
    doc.setTextColor(13, 27, 57);
    doc.text(quotation.quotation_number, pageWidth - margin, headerTop + 32, { align: "right" });

    const statusLabel = (quotation.status || "draft").toUpperCase();
    doc.setFontSize(8);
    const pillW = doc.getTextWidth(statusLabel) + 16;
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(pageWidth - margin - pillW, headerTop + 40, pillW, 16, 8, 8, "F");
    doc.setTextColor(29, 78, 216);
    doc.text(statusLabel, pageWidth - margin - pillW / 2, headerTop + 51, { align: "center" });

    y = headerTop + 62;
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, y, pageWidth - margin, y);
    y += 24;

    const estimateNote = quotation.estimate_note || DEFAULT_QUOTATION_ESTIMATE_NOTE;
    const estimateLines = doc.splitTextToSize(`Rough project estimate: ${estimateNote}`, innerWidth - 24);
    const noticeH = 26 + estimateLines.length * 12;
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(margin, y, innerWidth, noticeH, 10, 10, "F");
    doc.setFont("NeueCampton", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120, 53, 15);
    doc.text(estimateLines, margin + 12, y + 18);
    y += noticeH + 24;

    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text("PROJECT / COMPANY", margin, y);
    doc.text("ISSUED / VALIDITY", pageWidth - margin, y, { align: "right" });

    doc.setFontSize(12);
    doc.setTextColor(13, 27, 57);
    doc.text(quotation.project_name || "-", margin, y + 18);

    doc.setFont("NeueCampton", "normal");
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    doc.text(fmtDate(quotation.issue_date), pageWidth - margin, y + 18, { align: "right" });
    if (quotation.valid_until) {
        doc.text(`Valid until ${fmtDate(quotation.valid_until)}`, pageWidth - margin, y + 34, { align: "right" });
    }

    let leftY = y + 46;
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text("PREPARED FOR", margin, leftY);
    doc.setFontSize(12);
    doc.setTextColor(13, 27, 57);
    doc.text(quotation.client_name || "-", margin, leftY + 18);
    leftY += 34;
    doc.setFont("NeueCampton", "normal");
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    if (quotation.client_email) {
        doc.text(quotation.client_email, margin, leftY);
        leftY += 13;
    }
    if (quotation.client_address) {
        const addrLines = doc.splitTextToSize(quotation.client_address, innerWidth * 0.55);
        doc.text(addrLines, margin, leftY);
        leftY += addrLines.length * 13;
    }
    doc.setFont("NeueCampton", "bold");
    doc.setTextColor(13, 27, 57);
    doc.text(`Delivery: ${quotation.delivery_period || "-"}`, pageWidth - margin, y + 54, { align: "right" });
    y = Math.max(leftY, y + 72) + 18;

    const col = {
        name: margin + 12,
        // Sits left enough that a full "NGN 850,000.00" unit price keeps a
        // clear gap from the quantity instead of reading as one figure.
        qty: margin + innerWidth * 0.49,
        unit: margin + innerWidth * 0.72,
        total: margin + innerWidth - 12,
    };
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, innerWidth, 26, "F");
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text("ITEM", col.name, y + 17);
    doc.text("QTY", col.qty, y + 17, { align: "right" });
    doc.text("UNIT PRICE", col.unit, y + 17, { align: "right" });
    doc.text("ESTIMATE", col.total, y + 17, { align: "right" });
    y += 26;

    items.forEach((it, i) => {
        const nameLines = doc.splitTextToSize(it.name || "-", innerWidth * 0.4);
        const descLines = it.description ? doc.splitTextToSize(it.description, innerWidth * 0.4) : [];
        const rowHeight = Math.max(28, nameLines.length * 14 + descLines.length * 11 + (descLines.length ? 6 : 14));
        ensureSpace(rowHeight + 2);
        if (i % 2 === 1) {
            doc.setFillColor(239, 246, 255);
            doc.rect(margin, y, innerWidth, rowHeight, "F");
        }
        doc.setFont("NeueCampton", "bold");
        doc.setFontSize(11);
        doc.setTextColor(13, 27, 57);
        doc.text(nameLines, col.name, y + 16);
        if (descLines.length) {
            doc.setFont("NeueCampton", "normal");
            doc.setFontSize(9);
            doc.setTextColor(107, 114, 128);
            doc.text(descLines, col.name, y + 16 + nameLines.length * 12);
        }
        doc.setFont("NeueCampton", "normal");
        doc.setFontSize(10);
        doc.setTextColor(75, 85, 99);
        doc.text(String(it.quantity ?? 1), col.qty, y + 16, { align: "right" });
        doc.text(fmtMoney(it.unit_price, currency), col.unit, y + 16, { align: "right" });
        doc.setFont("NeueCampton", "bold");
        doc.setTextColor(13, 27, 57);
        doc.text(fmtMoney(it.total, currency), col.total, y + 16, { align: "right" });
        y += rowHeight;
        doc.setDrawColor(243, 244, 246);
        doc.line(margin, y, margin + innerWidth, y);
    });

    y += 24;
    ensureSpace(130);
    if (sealImg) {
        try {
            doc.addImage(sealImg.data, sealImg.format, margin, y, 80, 80);
        } catch {}
    }
    const totalsX = margin + innerWidth - 230;
    let totalsY = y + 8;
    const drawTotalRow = (label: string, value: string, strong = false) => {
        doc.setFont("NeueCampton", strong ? "bold" : "normal");
        doc.setFontSize(strong ? 14 : 11);
        doc.setTextColor(strong ? 13 : 107, strong ? 27 : 114, strong ? 57 : 128);
        doc.text(label, totalsX, totalsY);
        doc.setTextColor(strong ? 13 : 75, strong ? 27 : 85, strong ? 57 : 99);
        doc.text(value, totalsX + 230, totalsY, { align: "right" });
        totalsY += strong ? 20 : 16;
    };
    drawTotalRow("Subtotal", fmtMoney(quotation.subtotal, currency));
    if (Number(quotation.discount || 0) > 0) drawTotalRow("Discount", `- ${fmtMoney(quotation.discount, currency)}`);
    if (Number(quotation.tax_rate || 0) > 0) drawTotalRow(`Tax (${quotation.tax_rate}%)`, fmtMoney(quotation.tax_amount, currency));
    doc.setDrawColor(229, 231, 235);
    doc.line(totalsX, totalsY - 4, totalsX + 230, totalsY - 4);
    totalsY += 4;
    drawTotalRow("Estimated Total", fmtMoney(quotation.total, currency), true);
    y = Math.max(y + 80, totalsY) + 24;

    if (quotation.notes) {
        const noteLines = doc.splitTextToSize(quotation.notes, innerWidth - 24);
        const noteH = 34 + noteLines.length * 12;
        ensureSpace(noteH + 16);
        doc.setFillColor(239, 246, 255);
        doc.roundedRect(margin, y, innerWidth, noteH, 10, 10, "F");
        doc.setFont("NeueCampton", "bold");
        doc.setFontSize(9);
        doc.setTextColor(156, 163, 175);
        doc.text("NOTES", margin + 14, y + 18);
        doc.setFont("NeueCampton", "normal");
        doc.setFontSize(10);
        doc.setTextColor(55, 65, 81);
        doc.text(noteLines, margin + 14, y + 34);
        y += noteH + 20;
    }

    if (samples.length > 0) {
        ensureSpace(110);
        doc.setFont("NeueCampton", "bold");
        doc.setFontSize(11);
        doc.setTextColor(13, 27, 57);
        doc.text("Sample References", margin, y);
        y += 16;
        const thumbW = 96;
        const thumbH = 72;
        let x = margin;
        imageSamples.forEach((sample, idx) => {
            const img = sampleImgs[idx];
            if (!img) return;
            if (x + thumbW > pageWidth - margin) {
                x = margin;
                y += thumbH + 28;
                ensureSpace(thumbH + 40);
            }
            try {
                doc.addImage(img.data, img.format, x, y, thumbW, thumbH);
            } catch {}
            doc.setFont("NeueCampton", "normal");
            doc.setFontSize(8);
            doc.setTextColor(75, 85, 99);
            doc.text(doc.splitTextToSize(sample.label || host(sample.url), thumbW), x, y + thumbH + 11);
            x += thumbW + 14;
        });
        if (imageSamples.length > 0) y += thumbH + 34;
        samples.filter((s) => s.kind === "link").forEach((sample) => {
            ensureSpace(16);
            doc.setFont("NeueCampton", "normal");
            doc.setFontSize(9);
            doc.setTextColor(29, 78, 216);
            doc.text(`- ${sample.label || host(sample.url)}: ${sample.url}`, margin, y);
            y += 13;
        });
        y += 8;
    }

    ensureSpace(130);
    const detailsH = 104;
    doc.setFillColor(6, 16, 58);
    doc.roundedRect(margin, y, innerWidth, detailsH, 14, 14, "F");
    doc.setFillColor(10, 79, 232);
    doc.roundedRect(margin + 20, y + 18, 98, 20, 6, 6, "F");
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("Estimate Details", margin + 69, y + 32, { align: "center" });
    const lines = [
        `Delivery Period: ${quotation.delivery_period || "-"}`,
        `No. of Revisions: ${quotation.revisions_note || DEFAULT_REVISIONS_NOTE}`,
        `Working Hours: ${quotation.working_hours || DEFAULT_WORKING_HOURS}`,
        "Accounting: Not recorded in financial books until converted to invoice.",
    ];
    let detailY = y + 58;
    lines.forEach((line) => {
        doc.setFont("NeueCampton", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(230, 236, 248);
        doc.text(line, margin + 20, detailY);
        detailY += 14;
    });
    y += detailsH + 20;

    ensureSpace(30);
    doc.setFont("NeueCampton", "italic");
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text("Truly Best attracts Best - CDS Space", pageWidth / 2, y + 10, { align: "center" });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont("NeueCampton", "normal");
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 24, { align: "right" });
        doc.text("cdsspace.pro", margin, pageHeight - 24);
    }

    return doc;
}

/** File name the quotation PDF is saved under (as the web's download). */
export const quotationPdfFileName = (quotation: { quotation_number: string }) => `Quotation-${quotation.quotation_number}.pdf`;
