"use client";

import jsPDF from "jspdf";
import type { FinanceInvoice, FinanceInvoiceItem } from "./finance/types";
import {
    CDS_BANK_ACCOUNTS,
    DEFAULT_PAYMENT_TERMS,
    DEFAULT_REVISIONS_NOTE,
    DEFAULT_WORKING_HOURS,
    deliverySpeedLabel,
} from "./finance/types";

const CURRENCY_SYMBOLS: Record<string, string> = { NGN: "N", USD: "$", RWF: "FRw " };

function fmtMoney(n: number | string | null | undefined, currency: string) {
    const v = Number(n || 0);
    const sym = CURRENCY_SYMBOLS[currency] ?? "";
    return `${sym}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null | undefined) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch {
        return iso;
    }
}

/**
 * Fetch a /public asset and return it as a PNG data URI for jsPDF.
 * jsPDF.addImage cannot consume SVG directly, so SVGs are rasterised via
 * an offscreen canvas at the requested pixel size. PNGs are passed through.
 */
type LoadedImage = { data: string; format: "PNG"; width: number; height: number };

async function loadImageAsDataUri(
    url: string,
    targetWidth = 256,
): Promise<LoadedImage | null> {
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
            // Pull natural dimensions so callers can preserve aspect
            const dims = await new Promise<{ w: number; h: number }>((resolve) => {
                const img = new Image();
                img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
                img.onerror = () => resolve({ w: targetWidth, h: targetWidth });
                img.src = data;
            });
            return { data, format: "PNG", width: dims.w, height: dims.h };
        }

        // SVG → rasterise to PNG at aspect-preserving high-DPI canvas
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

/**
 * Client-side invoice PDF. Built to mirror the on-screen InvoiceDocument:
 *   - White header with CDS logo + company line + INVOICE / number / status
 *   - Billed-to + issued/due columns
 *   - Items table with zebra rows
 *   - CDS seal stamp next to totals
 *   - Navy "Payment Details" panel with bank accounts + terms / revisions /
 *     delivery / working hours
 *   - "Truly Best attracts Best — CDS Space" footer
 */
export async function exportInvoiceToPdf(invoice: FinanceInvoice, items: FinanceInvoiceItem[]) {
    const [logoImg, sealImg, moniepointImg, wemaImg] = await Promise.all([
        loadImageAsDataUri("/navbar/CDS Logo.svg", 256),
        loadImageAsDataUri("/CDS_Seal.png"),
        loadImageAsDataUri("/moniepoint.png"),
        loadImageAsDataUri("/wemabank.png"),
    ]);

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    const innerWidth = pageWidth - margin * 2;
    const currency = invoice.currency || "NGN";

    let y = margin + 8;

    // Header: logo + CDS Space / tagline on left, INVOICE / number / status on right
    const headerTop = y;
    const logoH = 32;
    const logoW = logoImg ? (logoImg.width / logoImg.height) * logoH : logoH * 2.5;
    let textLeft = margin;
    if (logoImg) {
        try {
            doc.addImage(logoImg.data, logoImg.format, margin, headerTop + 4, logoW, logoH);
            textLeft = margin + logoW + 14;
        } catch {
            // ignore — fall back to text-only header
        }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(13, 27, 57);
    doc.text("CDS Space", textLeft, headerTop + 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text("Branding & Digital Agency", textLeft, headerTop + 34);

    // Right: INVOICE eyebrow + number + status pill
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text("INVOICE", pageWidth - margin, headerTop + 10, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(13, 27, 57);
    doc.text(invoice.invoice_number, pageWidth - margin, headerTop + 32, { align: "right" });

    // Status pill
    const statusLabel = (invoice.status || "draft").toUpperCase();
    const statusColors: Record<string, { bg: [number, number, number]; fg: [number, number, number] }> = {
        PAID: { bg: [209, 250, 229], fg: [6, 95, 70] },
        SENT: { bg: [219, 234, 254], fg: [29, 78, 216] },
        OVERDUE: { bg: [254, 226, 226], fg: [153, 27, 27] },
        DRAFT: { bg: [243, 244, 246], fg: [75, 85, 99] },
        CANCELLED: { bg: [226, 232, 240], fg: [71, 85, 105] },
    };
    const pill = statusColors[statusLabel] ?? statusColors.DRAFT;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const pillTextWidth = doc.getTextWidth(statusLabel);
    const pillPaddingX = 8;
    const pillW = pillTextWidth + pillPaddingX * 2;
    const pillH = 16;
    const pillX = pageWidth - margin - pillW;
    const pillY = headerTop + 40;
    doc.setFillColor(...pill.bg);
    doc.roundedRect(pillX, pillY, pillW, pillH, 8, 8, "F");
    doc.setTextColor(...pill.fg);
    doc.text(statusLabel, pillX + pillW / 2, pillY + 11, { align: "center" });

    y = headerTop + 62;
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 24;

    // Bill-to + Issued / Due
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text("BILLED TO", margin, y);
    doc.text("ISSUED / DUE", pageWidth - margin, y, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(13, 27, 57);
    doc.text(invoice.client_name || "—", margin, y + 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    doc.text(fmtDate(invoice.issue_date), pageWidth - margin, y + 18, { align: "right" });

    let billY = y + 34;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    if (invoice.client_email && invoice.client_email !== "---") {
        doc.text(invoice.client_email, margin, billY);
        billY += 13;
    }
    if (invoice.client_address) {
        const addrLines = doc.splitTextToSize(invoice.client_address, innerWidth * 0.55);
        doc.text(addrLines, margin, billY);
        billY += addrLines.length * 13;
    }

    if (invoice.due_date) {
        doc.setTextColor(107, 114, 128);
        doc.text(`Due ${fmtDate(invoice.due_date)}`, pageWidth - margin, y + 34, { align: "right" });
    }

    y = Math.max(billY, y + 58) + 16;

    // Items table
    const col = {
        name: margin + 12,
        qty: margin + innerWidth * 0.55,
        unit: margin + innerWidth * 0.72,
        total: margin + innerWidth - 12,
    };

    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, innerWidth, 26, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text("ITEM", col.name, y + 17);
    doc.text("QTY", col.qty, y + 17, { align: "right" });
    doc.text("UNIT PRICE", col.unit, y + 17, { align: "right" });
    doc.text("AMOUNT", col.total, y + 17, { align: "right" });
    y += 26;

    const ensureSpace = (needed: number) => {
        if (y + needed > pageHeight - 70) {
            doc.addPage();
            y = margin;
        }
    };

    items.forEach((it, i) => {
        const nameLines = doc.splitTextToSize(it.name || "—", innerWidth * 0.52);
        const descLines = it.description
            ? doc.splitTextToSize(it.description, innerWidth * 0.52)
            : [];
        const rowHeight = Math.max(
            28,
            nameLines.length * 14 + descLines.length * 11 + (descLines.length ? 6 : 14),
        );
        ensureSpace(rowHeight + 2);

        // Zebra rows
        if (i % 2 === 1) {
            doc.setFillColor(239, 246, 255);
            doc.rect(margin, y, innerWidth, rowHeight, "F");
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(13, 27, 57);
        doc.text(nameLines, col.name, y + 16);

        if (descLines.length) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(107, 114, 128);
            doc.text(descLines, col.name, y + 16 + nameLines.length * 12);
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(75, 85, 99);
        doc.text(String(it.quantity ?? 1), col.qty, y + 16, { align: "right" });
        doc.text(fmtMoney(it.unit_price, currency), col.unit, y + 16, { align: "right" });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(13, 27, 57);
        doc.text(fmtMoney(it.total, currency), col.total, y + 16, { align: "right" });

        y += rowHeight;
        doc.setDrawColor(243, 244, 246);
        doc.setLineWidth(0.5);
        doc.line(margin, y, margin + innerWidth, y);
    });

    y += 24;
    ensureSpace(140);

    // Seal (left) + Totals (right)
    const sealSize = 80;
    if (sealImg) {
        try {
            doc.addImage(sealImg.data, sealImg.format, margin, y, sealSize, sealSize);
        } catch {
            // ignore
        }
    }

    const totalsX = margin + innerWidth - 220;
    const totalsW = 220;
    let totalsY = y + 8;
    const drawTotalRow = (label: string, value: string, strong = false) => {
        doc.setFont("helvetica", strong ? "bold" : "normal");
        doc.setFontSize(strong ? 14 : 11);
        doc.setTextColor(strong ? 13 : 107, strong ? 27 : 114, strong ? 57 : 128);
        doc.text(label, totalsX, totalsY);
        doc.setTextColor(strong ? 13 : 75, strong ? 27 : 85, strong ? 57 : 99);
        doc.text(value, totalsX + totalsW, totalsY, { align: "right" });
        totalsY += strong ? 20 : 16;
    };

    drawTotalRow("Subtotal", fmtMoney(invoice.subtotal, currency));
    if (Number(invoice.discount || 0) > 0) {
        drawTotalRow("Discount", `- ${fmtMoney(invoice.discount, currency)}`);
    }
    if (Number(invoice.tax_rate || 0) > 0) {
        drawTotalRow(`Tax (${invoice.tax_rate}%)`, fmtMoney(invoice.tax_amount, currency));
    }
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.75);
    doc.line(totalsX, totalsY - 4, totalsX + totalsW, totalsY - 4);
    totalsY += 4;
    drawTotalRow("Total", fmtMoney(invoice.total, currency), true);

    y = Math.max(y + sealSize, totalsY) + 24;

    // Notes
    if (invoice.notes) {
        const noteLines = doc.splitTextToSize(invoice.notes, innerWidth - 24);
        const noteH = 34 + noteLines.length * 12;
        ensureSpace(noteH + 16);
        doc.setFillColor(239, 246, 255);
        doc.roundedRect(margin, y, innerWidth, noteH, 10, 10, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(156, 163, 175);
        doc.text("NOTES", margin + 14, y + 18);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(55, 65, 81);
        doc.text(noteLines, margin + 14, y + 34);
        y += noteH + 20;
    }

    // Payment Details panel — navy card, bank accounts, terms
    const panelStart = y;
    ensureSpace(240);
    const bankRowH = 78;
    const termsH = 86;
    const panelH = 56 + bankRowH + termsH;
    doc.setFillColor(6, 16, 58);
    doc.roundedRect(margin, y, innerWidth, panelH, 14, 14, "F");

    // Header pill
    doc.setFillColor(10, 79, 232);
    const pdPillText = "Payment Details";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const pdPillTextW = doc.getTextWidth(pdPillText);
    const pdPillW = pdPillTextW + 22;
    doc.roundedRect(margin + 20, y + 18, pdPillW, 20, 6, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(pdPillText, margin + 20 + pdPillW / 2, y + 32, { align: "center" });

    // Bank accounts (2-column grid)
    const bankTop = y + 52;
    const bankColW = innerWidth / 2 - 24;
    const bankImgs = [moniepointImg, wemaImg];
    CDS_BANK_ACCOUNTS.forEach((b, idx) => {
        const colX = margin + 20 + idx * (bankColW + 24);
        const rowY = bankTop;

        // Logo tile (white rounded square)
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(colX, rowY, 46, 46, 8, 8, "F");
        const bImg = bankImgs[idx];
        if (bImg) {
            try {
                doc.addImage(bImg.data, bImg.format, colX + 5, rowY + 5, 36, 36);
            } catch {
                // ignore
            }
        } else {
            // Fallback: solid-colored initial tile
            doc.setFillColor(10, 79, 232);
            doc.roundedRect(colX, rowY, 46, 46, 8, 8, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(24);
            doc.text(b.initial, colX + 23, rowY + 32, { align: "center" });
        }

        // Bank text
        const textX = colX + 58;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(200, 210, 230);
        doc.text(b.bank, textX, rowY + 12);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(255, 255, 255);
        doc.text(b.account_number, textX, rowY + 32);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(200, 210, 230);
        const nameLines = doc.splitTextToSize(b.account_name, bankColW - 62);
        doc.text(nameLines, textX, rowY + 46);
    });

    // Divider + Terms block — faint line inside the navy panel
    const termsY = bankTop + bankRowH - 10;
    doc.setDrawColor(40, 55, 110);
    doc.setLineWidth(0.5);
    doc.line(margin + 20, termsY, pageWidth - margin - 20, termsY);

    const terms = invoice.payment_terms || DEFAULT_PAYMENT_TERMS;
    const revisions = invoice.revisions_note || DEFAULT_REVISIONS_NOTE;
    const hours = invoice.working_hours || DEFAULT_WORKING_HOURS;
    const speed = deliverySpeedLabel(invoice.delivery_speed || "standard");
    const period = invoice.delivery_period || "—";

    let tY = termsY + 16;
    const drawTermsLine = (label: string, value: string) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(200, 210, 230);
        const labelW = doc.getTextWidth(label + "  ");
        doc.text(label, margin + 20, tY);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text(value, margin + 20 + labelW, tY);
        tY += 14;
    };
    drawTermsLine("Payment Terms:", terms);
    drawTermsLine("No. of Revisions:", revisions);
    drawTermsLine("Delivery:", `${speed}  ·  Period: ${period}`);
    drawTermsLine("Working Hours:", hours);

    y = panelStart + panelH + 20;

    // Footer tagline
    ensureSpace(30);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text("Truly Best attracts Best — CDS Space", pageWidth / 2, y + 10, { align: "center" });

    // Page numbers on every page
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 24, { align: "right" });
        doc.text("cdsspace.com  |  cdsspace.pro", margin, pageHeight - 24);
    }

    doc.save(`Invoice-${invoice.invoice_number}.pdf`);
}
