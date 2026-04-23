"use client";

import jsPDF from "jspdf";
import type { FinanceInvoice, FinanceInvoiceItem } from "./finance/types";

const CURRENCY_SYMBOLS: Record<string, string> = { NGN: "₦", USD: "$", RWF: "FRw " };

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
 * Reliable client-side invoice PDF. Skips html2canvas entirely — renders the
 * invoice as structured jsPDF primitives, which means no CORS image issues,
 * no canvas hangs, no "loading forever" bugs. Consistent layout every time.
 */
export function exportInvoiceToPdf(invoice: FinanceInvoice, items: FinanceInvoiceItem[]) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    const innerWidth = pageWidth - margin * 2;
    const currency = invoice.currency || "NGN";

    let y = margin;

    // Header band
    doc.setFillColor(4, 11, 55);
    doc.rect(0, 0, pageWidth, 110, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("INVOICE", margin, 52);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(200, 220, 255);
    doc.text("CDS Space — Branding Agency", margin, 74);

    // Invoice number + status (right side of header)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(invoice.invoice_number, pageWidth - margin, 52, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(200, 220, 255);
    doc.text(`Status: ${(invoice.status || "draft").toUpperCase()}`, pageWidth - margin, 72, { align: "right" });
    doc.text(`Issued: ${fmtDate(invoice.issue_date)}`, pageWidth - margin, 86, { align: "right" });

    y = 140;

    // Bill-to block
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("BILL TO", margin, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(13, 27, 57);
    doc.text(invoice.client_name || "—", margin, y + 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(71, 85, 105);
    let billY = y + 36;
    if (invoice.client_email) {
        doc.text(invoice.client_email, margin, billY);
        billY += 14;
    }
    if (invoice.client_address) {
        const addrLines = doc.splitTextToSize(invoice.client_address, innerWidth / 2);
        doc.text(addrLines, margin, billY);
        billY += addrLines.length * 14;
    }

    // Due date (right side)
    if (invoice.due_date) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text("DUE DATE", pageWidth - margin, y, { align: "right" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(13, 27, 57);
        doc.text(fmtDate(invoice.due_date), pageWidth - margin, y + 18, { align: "right" });
    }

    y = Math.max(billY, y + 72) + 20;

    // Items table
    const col = {
        name: margin,
        qty: margin + innerWidth * 0.55,
        unit: margin + innerWidth * 0.7,
        total: margin + innerWidth,
    };

    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, innerWidth, 26, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text("ITEM", col.name + 8, y + 17);
    doc.text("QTY", col.qty, y + 17, { align: "center" });
    doc.text("UNIT PRICE", col.unit, y + 17, { align: "center" });
    doc.text("TOTAL", col.total - 8, y + 17, { align: "right" });
    y += 32;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    const ensureSpace = (needed: number) => {
        if (y + needed > pageHeight - 130) {
            doc.addPage();
            y = margin;
        }
    };

    for (const it of items) {
        const nameLines = doc.splitTextToSize(it.name || "—", innerWidth * 0.53);
        const descLines = it.description
            ? doc.splitTextToSize(it.description, innerWidth * 0.53)
            : [];
        const rowHeight = Math.max(
            18,
            nameLines.length * 14 + descLines.length * 12 + (descLines.length ? 4 : 0),
        );
        ensureSpace(rowHeight + 8);

        doc.setTextColor(13, 27, 57);
        doc.setFont("helvetica", "bold");
        doc.text(nameLines, col.name + 8, y + 12);

        if (descLines.length) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            doc.text(descLines, col.name + 8, y + 12 + nameLines.length * 14);
            doc.setFontSize(11);
        }

        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(String(it.quantity ?? 1), col.qty, y + 12, { align: "center" });
        doc.text(fmtMoney(it.unit_price, currency), col.unit, y + 12, { align: "center" });

        doc.setFont("helvetica", "bold");
        doc.setTextColor(13, 27, 57);
        doc.text(fmtMoney(it.total, currency), col.total - 8, y + 12, { align: "right" });

        y += rowHeight + 8;
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.line(margin, y, margin + innerWidth, y);
        y += 8;
    }

    // Totals block
    ensureSpace(120);
    const totalsX = margin + innerWidth * 0.6;
    const totalsWidth = innerWidth * 0.4;
    const rowGap = 18;

    const drawTotalRow = (label: string, value: string, strong = false) => {
        doc.setFont("helvetica", strong ? "bold" : "normal");
        doc.setFontSize(strong ? 13 : 11);
        doc.setTextColor(strong ? 13 : 71, strong ? 27 : 85, strong ? 57 : 105);
        doc.text(label, totalsX, y);
        doc.text(value, totalsX + totalsWidth, y, { align: "right" });
        y += rowGap;
    };

    drawTotalRow("Subtotal", fmtMoney(invoice.subtotal, currency));
    if (Number(invoice.discount || 0) > 0) {
        drawTotalRow("Discount", `- ${fmtMoney(invoice.discount, currency)}`);
    }
    if (Number(invoice.tax_rate || 0) > 0) {
        drawTotalRow(`Tax (${invoice.tax_rate}%)`, fmtMoney(invoice.tax_amount, currency));
    }
    doc.setDrawColor(13, 27, 57);
    doc.setLineWidth(1);
    doc.line(totalsX, y - 4, totalsX + totalsWidth, y - 4);
    y += 4;
    drawTotalRow("Total", fmtMoney(invoice.total, currency), true);

    // Payment terms
    if (invoice.payment_terms || invoice.revisions_note || invoice.delivery_period) {
        ensureSpace(80);
        y += 12;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text("PAYMENT TERMS & DELIVERY", margin, y);
        y += 16;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(71, 85, 105);
        if (invoice.payment_terms) {
            const lines = doc.splitTextToSize(invoice.payment_terms, innerWidth);
            ensureSpace(lines.length * 12 + 4);
            doc.text(lines, margin, y);
            y += lines.length * 12 + 4;
        }
        if (invoice.revisions_note) {
            const lines = doc.splitTextToSize(invoice.revisions_note, innerWidth);
            ensureSpace(lines.length * 12 + 4);
            doc.text(lines, margin, y);
            y += lines.length * 12 + 4;
        }
        if (invoice.delivery_period) {
            const lines = doc.splitTextToSize(`Delivery: ${invoice.delivery_period}`, innerWidth);
            ensureSpace(lines.length * 12 + 4);
            doc.text(lines, margin, y);
            y += lines.length * 12 + 4;
        }
    }

    // Notes
    if (invoice.notes) {
        ensureSpace(40);
        y += 8;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text("NOTES", margin, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(71, 85, 105);
        const noteLines = doc.splitTextToSize(invoice.notes, innerWidth);
        doc.text(noteLines, margin, y);
    }

    // Footer every page
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, pageHeight - 50, pageWidth - margin, pageHeight - 50);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(148, 163, 184);
        doc.text("cdsspace.com  •  Branding · Design · Build", margin, pageHeight - 32);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 32, { align: "right" });
    }

    doc.save(`Invoice-${invoice.invoice_number}.pdf`);
}
