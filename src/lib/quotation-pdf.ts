"use client";

import jsPDF from "jspdf";
import { installBrandFont } from "./pdf/pdf-fonts";
import { localizePdfLabels } from "./pdf/pdf-i18n";
import type { FinanceQuotation, FinanceQuotationItem, FinanceQuotationSample } from "./finance/types";
import {
    DEFAULT_QUOTATION_ESTIMATE_NOTE,
    DEFAULT_REVISIONS_NOTE,
    DEFAULT_WORKING_HOURS,
    formatFinanceDate,
} from "./finance/types";

const CURRENCY_SYMBOLS: Record<string, string> = { NGN: "N", USD: "$", GBP: "GBP ", EUR: "EUR ", RWF: "FRw ", CNY: "CNY ", AED: "AED " };

function fmtMoney(n: number | string | null | undefined, currency: string) {
    const v = Number(n || 0);
    const sym = CURRENCY_SYMBOLS[currency] ?? "";
    return `${sym}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null | undefined) {
    return formatFinanceDate(iso, { year: "numeric", month: "short", day: "numeric" });
}

type LoadedImage = { data: string; format: "PNG"; width: number; height: number };

async function loadImageAsDataUri(url: string, targetWidth = 256): Promise<LoadedImage | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const contentType = res.headers.get("content-type") || "";
        const isSvg = contentType.includes("svg") || url.toLowerCase().endsWith(".svg");
        const blob = await res.blob();

        if (!isSvg) {
            const data = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
                reader.onerror = () => resolve("");
                reader.readAsDataURL(blob);
            });
            if (!data) return null;
            const dims = await new Promise<{ w: number; h: number }>((resolve) => {
                const img = new Image();
                img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
                img.onerror = () => resolve({ w: targetWidth, h: targetWidth });
                img.src = data;
            });
            return { data, format: "PNG", width: dims.w, height: dims.h };
        }

        const svgText = await blob.text();
        const objectUrl = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
        return await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const aspect = img.naturalHeight / img.naturalWidth || 1;
                    const w = targetWidth;
                    const h = Math.round(targetWidth * aspect);
                    const canvas = document.createElement("canvas");
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        URL.revokeObjectURL(objectUrl);
                        resolve(null);
                        return;
                    }
                    ctx.drawImage(img, 0, 0, w, h);
                    const data = canvas.toDataURL("image/png");
                    URL.revokeObjectURL(objectUrl);
                    resolve({ data, format: "PNG", width: w, height: h });
                } catch {
                    URL.revokeObjectURL(objectUrl);
                    resolve(null);
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(null);
            };
            img.src = objectUrl;
        });
    } catch {
        return null;
    }
}

function host(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

export async function exportQuotationToPdf(
    quotation: FinanceQuotation,
    items: FinanceQuotationItem[],
    samples: FinanceQuotationSample[] = [],
) {
    const imageSamples = samples.filter((s) => s.kind === "image").slice(0, 6);
    const [logoImg, sealImg, ...sampleImgs] = await Promise.all([
        loadImageAsDataUri("/navbar/CDS Logo.svg", 256),
        loadImageAsDataUri("/CDS_Seal.png"),
        ...imageSamples.map((sample) => loadImageAsDataUri(sample.url, 300)),
    ]);

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    installBrandFont(doc);
    await localizePdfLabels(doc as unknown as { text: (...args: unknown[]) => unknown }, [
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
        qty: margin + innerWidth * 0.55,
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
        const nameLines = doc.splitTextToSize(it.name || "-", innerWidth * 0.52);
        const descLines = it.description ? doc.splitTextToSize(it.description, innerWidth * 0.52) : [];
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
        doc.text("cdsspace.com  |  cdsspace.pro", margin, pageHeight - 24);
    }

    doc.save(`Quotation-${quotation.quotation_number}.pdf`);
}
