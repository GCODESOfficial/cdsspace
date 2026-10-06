import "server-only";

import jsPDF from "jspdf";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";
import { BRAND_BRIEF_FIELD_LABELS, type BrandBriefDraft } from "@/lib/brand-brief";

/**
 * Server-side brand brief → PDF for the mobile admin app, which has no browser
 * to run src/lib/brand-brief-pdf.ts (that one draws in the browser and calls
 * save()). Same layout: navy title band, the five brief sections and a CDS
 * Space footer on every page.
 */

const SECTIONS: Array<{ title: string; fields: (keyof BrandBriefDraft)[] }> = [
  { title: "The Brand", fields: ["brand_name", "brand_tagline", "industry", "brand_description"] },
  { title: "Contact", fields: ["contact_name", "contact_email", "contact_phone"] },
  { title: "Audience & Market", fields: ["target_audience", "competitors", "unique_selling_point"] },
  { title: "Brand Identity", fields: ["brand_personality", "brand_values", "design_preferences", "inspiration_references"] },
  {
    title: "Scope & Goals",
    fields: ["assets_needed", "goals", "long_term_vision", "budget_currency", "budget_range", "timeline", "additional_notes"],
  },
];

export function buildBrandBriefPdf(
  draft: BrandBriefDraft,
  opts?: { inviteLabel?: string | null; status?: string; submittedAt?: string | null },
): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  installBrandFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const innerWidth = pageWidth - margin * 2;

  doc.setFillColor(4, 11, 55);
  doc.rect(0, 0, pageWidth, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("NeueCampton", "bold");
  doc.setFontSize(20);
  doc.text("Brand Brief", margin, 48);
  doc.setFont("NeueCampton", "normal");
  doc.setFontSize(11);
  doc.setTextColor(200, 220, 255);
  doc.text("CDS Space - Branding Agency", margin, 68);

  let y = 120;
  const title = draft.brand_name?.trim() || opts?.inviteLabel?.trim() || "Untitled brief";
  doc.setTextColor(13, 27, 57);
  doc.setFont("NeueCampton", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, y);
  y += 18;

  doc.setFont("NeueCampton", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  const meta: string[] = [];
  if (opts?.status) meta.push(`Status: ${opts.status}`);
  if (opts?.submittedAt) meta.push(`Submitted: ${new Date(opts.submittedAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })}`);
  if (draft.contact_email) meta.push(`Email: ${draft.contact_email}`);
  if (meta.length) doc.text(meta.join("   •   "), margin, y);
  y += 22;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 80) {
      doc.addPage();
      y = margin;
    }
  };

  for (const section of SECTIONS) {
    ensureSpace(50);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(12);
    doc.setTextColor(10, 79, 232);
    doc.text(section.title.toUpperCase(), margin, y);
    y += 16;

    for (const key of section.fields) {
      const label = BRAND_BRIEF_FIELD_LABELS[key] ?? String(key);
      const raw = draft[key] as string | string[];
      const value = Array.isArray(raw) ? raw.join(", ") : raw;
      const display = value?.toString().trim() ? value.toString().trim() : "-";

      doc.setFont("NeueCampton", "bold");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      const labelLines = doc.splitTextToSize(label, innerWidth);
      ensureSpace(12 + labelLines.length * 12);
      doc.text(labelLines, margin, y);
      y += labelLines.length * 12;

      doc.setFont("NeueCampton", "normal");
      doc.setFontSize(11);
      doc.setTextColor(13, 27, 57);
      const valueLines = doc.splitTextToSize(display, innerWidth);
      ensureSpace(valueLines.length * 14 + 8);
      doc.text(valueLines, margin, y);
      y += valueLines.length * 14 + 8;
    }
    y += 6;
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 50, pageWidth - margin, pageHeight - 50);
    doc.setFont("NeueCampton", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("cdsspace.pro  •  Branding · Design · Build", margin, pageHeight - 32);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 32, { align: "right" });
  }

  return doc.output("arraybuffer");
}

/** Same file name the web download uses. */
export function brandBriefPdfFileName(name: string | null | undefined) {
  const slug =
    (name || "brand-brief")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "brand-brief";
  return `CDSSpace-BrandBrief-${slug}.pdf`;
}
