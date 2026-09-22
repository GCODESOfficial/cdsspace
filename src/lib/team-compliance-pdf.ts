import "server-only";

import jsPDF from "jspdf";
import { EMAIL_LOGO_PNG_BASE64 } from "@/lib/email-logo";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";

export interface SopPdfRecord {
  sop_number: string;
  title: string;
  summary: string;
  content: string;
  scope_type: string;
  department: string | null;
  task_name: string | null;
  status: string;
  version: number;
  updated_at: string | Date;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const NAVY: [number, number, number] = [13, 27, 57];
const BLUE: [number, number, number] = [10, 79, 232];
const BODY: [number, number, number] = [55, 65, 81];
const MUTED: [number, number, number] = [107, 114, 128];
const LINE: [number, number, number] = [229, 231, 235];
const PALE_BLUE: [number, number, number] = [239, 245, 255];

function cleanFilePart(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "all"
  );
}

export function sopManualFileName(selectionLabel: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `CDS-Space-SOP-Manual-${cleanFilePart(selectionLabel)}-${date}.pdf`;
}

function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildSopManualPdf(
  sops: SopPdfRecord[],
  selectionLabel: string,
): ArrayBuffer {
  const doc = new jsPDF({
    unit: "pt",
    format: "a4",
    orientation: "portrait",
    compress: true,
  });
  installBrandFont(doc);
  doc.setProperties({
    title: `CDS Space SOP manual · ${selectionLabel}`,
    subject: "Standard operating procedures",
    author: "CDS Space",
    creator: "CDS Space Team compliance",
    keywords: "CDS Space, SOP, team compliance, operating procedures",
  });

  const logo = `data:image/png;base64,${EMAIL_LOGO_PNG_BASE64}`;
  let y = MARGIN;
  let activeSop: SopPdfRecord | null = null;

  const setFont = (
    size: number,
    color: [number, number, number],
    bold = false,
  ) => {
    doc.setFont("NeueCampton", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const drawBrandHeader = (rightLabel: string, rightValue: string) => {
    try {
      doc.addImage(logo, "PNG", MARGIN, MARGIN, 30, 30);
    } catch {
      // The text lockup still identifies the document if the image cannot load.
    }
    setFont(15, NAVY, true);
    doc.text("CDS Space", MARGIN + 40, MARGIN + 14);
    setFont(8.5, MUTED);
    doc.text("Branding & Digital Agency", MARGIN + 40, MARGIN + 28);

    setFont(8, MUTED, true);
    doc.text(rightLabel, PAGE_WIDTH - MARGIN, MARGIN + 7, {
      align: "right",
    });
    setFont(13, NAVY, true);
    doc.text(rightValue, PAGE_WIDTH - MARGIN, MARGIN + 25, {
      align: "right",
    });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, MARGIN + 46, PAGE_WIDTH - MARGIN, MARGIN + 46);
  };

  const addSopPage = (sop: SopPdfRecord, continuation = false) => {
    doc.addPage();
    activeSop = sop;
    drawBrandHeader(
      continuation ? "SOP · CONTINUED" : "STANDARD OPERATING PROCEDURE",
      sop.sop_number,
    );
    y = MARGIN + 72;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed <= PAGE_HEIGHT - 70) return;
    if (activeSop) {
      addSopPage(activeSop, true);
      return;
    }
    doc.addPage();
    drawBrandHeader("TEAM COMPLIANCE", "Document index");
    y = MARGIN + 76;
  };

  const writeLines = (
    text: string,
    options: {
      size: number;
      color?: [number, number, number];
      bold?: boolean;
      width?: number;
      indent?: number;
      lineHeight?: number;
      after?: number;
    },
  ) => {
    const width = options.width ?? CONTENT_WIDTH;
    const indent = options.indent ?? 0;
    const lineHeight = options.lineHeight ?? options.size * 1.45;
    setFont(options.size, options.color ?? BODY, options.bold);
    const rows = doc.splitTextToSize(text, width) as string[];
    ensureSpace(rows.length * lineHeight + (options.after ?? 0));
    setFont(options.size, options.color ?? BODY, options.bold);
    doc.text(rows, MARGIN + indent, y, {
      lineHeightFactor: lineHeight / options.size,
    });
    y += rows.length * lineHeight + (options.after ?? 0);
  };

  // Cover page, following the clean logo-and-document treatment used by invoices.
  drawBrandHeader("TEAM COMPLIANCE", "SOP manual");
  y = 142;
  doc.setFillColor(...BLUE);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 184, 16, 16, "F");
  setFont(10, [218, 231, 255], true);
  doc.text("CDS SPACE · STANDARD OPERATING PROCEDURES", MARGIN + 28, y + 36);
  setFont(26, [255, 255, 255], true);
  const selectionLines = (
    doc.splitTextToSize(selectionLabel, CONTENT_WIDTH - 56) as string[]
  ).slice(0, 3);
  doc.text(selectionLines, MARGIN + 28, y + 76, { lineHeightFactor: 1.1 });
  setFont(11, [228, 237, 255]);
  doc.text(
    `${sops.length} ${sops.length === 1 ? "procedure" : "procedures"} · Exported ${formatDate(new Date())}`,
    MARGIN + 28,
    y + 150,
  );

  y = 365;
  setFont(15, NAVY, true);
  doc.text("Document index", MARGIN, y);
  y += 24;
  for (const sop of sops) {
    const indexRows = doc.splitTextToSize(
      `${sop.sop_number}  ${sop.title}`,
      CONTENT_WIDTH - 70,
    ) as string[];
    ensureSpace(indexRows.length * 13 + 12);
    setFont(9.5, NAVY, true);
    doc.text(indexRows, MARGIN, y, { lineHeightFactor: 1.35 });
    setFont(8.5, MUTED);
    doc.text(titleCase(sop.scope_type), PAGE_WIDTH - MARGIN, y, {
      align: "right",
    });
    y += indexRows.length * 13 + 8;
    doc.setDrawColor(...LINE);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 10;
  }

  for (const sop of sops) {
    addSopPage(sop);

    const badges = [
      titleCase(sop.scope_type),
      sop.department,
      sop.task_name,
      titleCase(sop.status),
      `Version ${sop.version}`,
    ].filter(Boolean) as string[];

    setFont(9, BLUE, true);
    doc.text(badges.join("  ·  "), MARGIN, y);
    y += 21;
    writeLines(sop.title || "Untitled SOP", {
      size: 20,
      color: NAVY,
      bold: true,
      lineHeight: 24,
      after: 12,
    });

    if (sop.summary) {
      const summaryRows = doc.splitTextToSize(
        sop.summary,
        CONTENT_WIDTH - 28,
      ) as string[];
      const summaryHeight = summaryRows.length * 15 + 28;
      ensureSpace(summaryHeight);
      doc.setFillColor(...PALE_BLUE);
      doc.roundedRect(MARGIN, y, CONTENT_WIDTH, summaryHeight, 8, 8, "F");
      setFont(10.5, BODY);
      doc.text(summaryRows, MARGIN + 14, y + 18, { lineHeightFactor: 1.43 });
      y += summaryHeight + 18;
    }

    const contentLines = (
      sop.content || "Procedure content has not been added."
    )
      .replace(/\r\n/g, "\n")
      .split("\n");
    for (const rawLine of contentLines) {
      const line = rawLine.trim();
      if (!line) {
        y += 5;
        continue;
      }
      if (
        /^(purpose|procedure|evidence|escalation|scope|responsibility|responsibilities)$/i.test(
          line,
        )
      ) {
        ensureSpace(34);
        y += 7;
        writeLines(line, {
          size: 12,
          color: NAVY,
          bold: true,
          lineHeight: 16,
          after: 7,
        });
        continue;
      }
      const numbered = line.match(/^(\d+\.)\s+(.+)$/);
      if (numbered) {
        setFont(10.2, BLUE, true);
        const numberWidth = Math.max(20, doc.getTextWidth(numbered[1]) + 8);
        const rows = doc.splitTextToSize(
          numbered[2],
          CONTENT_WIDTH - numberWidth,
        ) as string[];
        ensureSpace(rows.length * 15 + 7);
        setFont(10.2, BLUE, true);
        doc.text(numbered[1], MARGIN, y);
        setFont(10.2, BODY);
        doc.text(rows, MARGIN + numberWidth, y, { lineHeightFactor: 1.47 });
        y += rows.length * 15 + 7;
        continue;
      }
      writeLines(line, {
        size: 10.2,
        color: BODY,
        lineHeight: 15,
        after: 8,
      });
    }

    ensureSpace(28);
    y += 8;
    doc.setDrawColor(...LINE);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 15;
    setFont(8.5, MUTED);
    doc.text(`Last updated ${formatDate(sop.updated_at)}`, MARGIN, y);
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, PAGE_HEIGHT - 50, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 50);
    setFont(8.5, MUTED);
    doc.text(
      "cdsspace.pro · Truly Best attracts Best",
      MARGIN,
      PAGE_HEIGHT - 32,
    );
    doc.text(
      `Page ${page} of ${pageCount}`,
      PAGE_WIDTH - MARGIN,
      PAGE_HEIGHT - 32,
      {
        align: "right",
      },
    );
  }

  return doc.output("arraybuffer");
}
