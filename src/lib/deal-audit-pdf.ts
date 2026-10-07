import "server-only";

import jsPDF from "jspdf";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";
import type { DealAuditContent } from "@/lib/deals-ai";
import { auditChartData, SEVERITY } from "@/lib/audit-charts";
import { EMAIL_LOGO_PNG_BASE64 } from "@/lib/email-logo";

export interface DealAuditDocument {
  brand_name: string;
  target_url: string;
  overall_score: number | null;
  content: DealAuditContent;
  created_at: string;
}

const BLUE: [number, number, number] = [10, 79, 232];
const INK: [number, number, number] = [7, 19, 59];
const BODY: [number, number, number] = [31, 42, 68];
const MUTED: [number, number, number] = [110, 124, 153];
const PALE: [number, number, number] = [237, 243, 254];
/** The gauge's unfilled arc: the blue band lightened, so the fill still reads. */
const GAUGE_TRACK: [number, number, number] = [92, 139, 240];

// A4 portrait, in points: a document to read and forward, not a deck.
const WIDTH = 595;
const HEIGHT = 842;
const MARGIN = 46;
const CONTENT = WIDTH - MARGIN * 2;

/** #rrggbb to the 0-255 triple jsPDF wants. */
const SEVERITY_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(SEVERITY).map(([key, value]) => [key, value.color]),
);

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "brand";
}

export function dealAuditFileName(audit: { brand_name: string }) {
  return `CDS-Space-${slug(audit.brand_name)}-brand-audit.pdf`;
}

/**
 * The audit on one A4 page, under a CDS Space header: the verdict and score,
 * what the company needs, the scorecard beside the main findings, three
 * priority actions, and where it could go. Every block has a fixed number of
 * lines, so the page never spills onto a second sheet however long the audit.
 */
export function buildDealAuditPdf(audit: DealAuditDocument): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  installBrandFont(doc);
  const content = audit.content || ({} as DealAuditContent);
  const chart = auditChartData(content, audit.overall_score);
  const dated = new Date(audit.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const setText = (color: [number, number, number], size: number, bold = false) => {
    doc.setFont("NeueCampton", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  /** Wrapped to a width and cut to a number of lines, ending in an ellipsis if cut. */
  const clamp = (value: string, width: number, max: number) => {
    const rows = doc.splitTextToSize(String(value || "").trim(), width) as string[];
    if (rows.length <= max) return rows;
    const kept = rows.slice(0, max);
    kept[max - 1] = `${kept[max - 1].replace(/[\s,.;:]+$/, "")}...`;
    return kept;
  };
  const write = (rows: string[], x: number, top: number, size: number) => {
    rows.forEach((row, index) => doc.text(row, x, top + index * (size + 3.5)));
    return top + rows.length * (size + 3.5);
  };
  const sectionTitle = (value: string, x: number, top: number) => {
    setText(INK, 10.5, true);
    doc.text(value, x, top);
    doc.setDrawColor(...PALE);
    doc.setLineWidth(1.2);
    return top + 14;
  };

  // CDS Space header.
  try { doc.addImage(`data:image/png;base64,${EMAIL_LOGO_PNG_BASE64}`, "PNG", MARGIN, 26, 24, 24); } catch { /* the name alone still brands the page */ }
  setText(INK, 13, true);
  doc.text("CDS Space", MARGIN + 32, 43);
  setText(MUTED, 9);
  doc.text(`Brand audit  |  ${dated}`, WIDTH - MARGIN, 43, { align: "right" });
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, 60, WIDTH - MARGIN, 60);

  // The headline panel: who, the verdict, and the score.
  const panelTop = 74;
  const panelHeight = 118;
  doc.setFillColor(...BLUE);
  doc.roundedRect(MARGIN, panelTop, CONTENT, panelHeight, 12, 12, "F");
  const textWidth = CONTENT - 130;
  setText([255, 255, 255], 18, true);
  let y = write(clamp(audit.brand_name, textWidth, 1), MARGIN + 18, panelTop + 30, 18);
  setText([214, 228, 255], 8.5);
  y = write(clamp(audit.target_url || "", textWidth, 1), MARGIN + 18, y + 2, 8.5);
  setText([255, 255, 255], 9.5);
  write(clamp(content.verdict || content.summary || "", textWidth, 4), MARGIN + 18, y + 8, 9.5);
  if (audit.overall_score !== null) {
    const cx = WIDTH - MARGIN - 58;
    const cy = panelTop + panelHeight / 2 - 2;
    const arc = (from: number, to: number, color: [number, number, number]) => {
      const point = (deg: number) => [cx + Math.sin((deg * Math.PI) / 180) * 36, cy - Math.cos((deg * Math.PI) / 180) * 36] as const;
      const steps = Math.max(2, Math.ceil((to - from) / 3));
      doc.setDrawColor(...color); doc.setLineWidth(9); doc.setLineCap("round");
      for (let step = 0; step < steps; step += 1) {
        const [x1, y1] = point(from + ((to - from) * step) / steps);
        const [x2, y2] = point(from + ((to - from) * (step + 1)) / steps);
        doc.line(x1, y1, x2, y2);
      }
      doc.setLineCap("butt");
    };
    arc(225, 495, GAUGE_TRACK);
    if (chart.score > 0) arc(225, 225 + (270 * chart.score) / 100, [255, 255, 255]);
    setText([255, 255, 255], 24, true);
    doc.text(String(chart.score), cx, cy + 6, { align: "center" });
    setText([214, 228, 255], 7.5);
    doc.text("out of 100", cx, cy + 20, { align: "center" });
  }

  // What the company needs, then the summary.
  y = panelTop + panelHeight + 24;
  if (content.context) {
    y = sectionTitle("What this company needs", MARGIN, y);
    setText(BODY, 9);
    y = write(clamp(content.context, CONTENT, 3), MARGIN, y, 9) + 8;
  }
  y = sectionTitle("Summary", MARGIN, y);
  setText(BODY, 9);
  y = write(clamp(content.summary || "", CONTENT, 5), MARGIN, y, 9) + 14;

  // Scorecard and findings, side by side.
  const gap = 22;
  const half = (CONTENT - gap) / 2;
  const columnsTop = y;
  let left = sectionTitle("Scorecard", MARGIN, columnsTop) + 2;
  for (const item of chart.scores.slice(0, 8)) {
    setText(INK, 8.5, true);
    doc.text(clamp(item.area, half - 30, 1)[0] || "", MARGIN, left);
    setText(BLUE, 8.5, true);
    doc.text(String(item.score), MARGIN + half, left, { align: "right" });
    doc.setFillColor(...PALE);
    doc.roundedRect(MARGIN, left + 4, half, 4.5, 2, 2, "F");
    if (item.score > 0) {
      doc.setFillColor(...(item.score < 40 ? rgb(SEVERITY_COLOR.high || "#DC2626") : item.score < 60 ? rgb(SEVERITY_COLOR.medium || "#D97706") : BLUE));
      doc.roundedRect(MARGIN, left + 4, Math.max(4.5, (item.score / 100) * half), 4.5, 2, 2, "F");
    }
    left += 24;
  }

  const rightX = MARGIN + half + gap;
  let right = sectionTitle("What we found", rightX, columnsTop) + 2;
  const order = { high: 0, medium: 1, low: 2 } as Record<string, number>;
  for (const finding of [...(content.findings || [])].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)).slice(0, 4)) {
    doc.setFillColor(...rgb(SEVERITY_COLOR[String(finding.severity)] || SEVERITY_COLOR.low || "#64748B"));
    doc.circle(rightX + 3, right - 3, 3, "F");
    setText(INK, 8.5, true);
    right = write(clamp(finding.title, half - 12, 1), rightX + 11, right, 8.5);
    setText(BODY, 8);
    right = write(clamp(finding.evidence, half - 11, 3), rightX + 11, right + 1, 8) + 8;
  }

  // Three priority actions in a row.
  y = Math.max(left, right) + 10;
  y = sectionTitle("Priority actions", MARGIN, y) + 2;
  const cardGap = 10;
  const cardWidth = (CONTENT - cardGap * 2) / 3;
  const cardHeight = 96;
  [...(content.recommendations || [])].sort((a, b) => a.priority - b.priority).slice(0, 3).forEach((item, index) => {
    const x = MARGIN + index * (cardWidth + cardGap);
    doc.setFillColor(...PALE);
    doc.roundedRect(x, y - 4, cardWidth, cardHeight, 8, 8, "F");
    doc.setFillColor(...BLUE);
    doc.circle(x + 14, y + 10, 7, "F");
    setText([255, 255, 255], 8, true);
    doc.text(String(index + 1), x + 14, y + 13, { align: "center" });
    setText(INK, 8.5, true);
    write(clamp(item.title, cardWidth - 34, 2), x + 26, y + 13, 8.5);
    setText(BODY, 7.8);
    write(clamp(item.action, cardWidth - 18, 6), x + 9, y + 40, 7.8);
  });
  y += cardHeight + 14;

  if (content.future_state) {
    y = sectionTitle("What it can become", MARGIN, y);
    setText(BODY, 9);
    y = write(clamp(content.future_state, CONTENT, 3), MARGIN, y, 9);
  }

  // Footer: how the audit was made.
  doc.setDrawColor(...PALE);
  doc.setLineWidth(1);
  doc.line(MARGIN, HEIGHT - 44, WIDTH - MARGIN, HEIGHT - 44);
  setText(MUTED, 7.5);
  const method = content.visual_review?.checked
    ? "Reviewed in a real browser on desktop and phone, and against current design, accessibility and search standards."
    : "Prepared from the site's public code and text; the visual design was not checked in a browser.";
  doc.text(`Prepared by CDS Space from publicly available evidence on ${dated}. ${method}`, MARGIN, HEIGHT - 30, { maxWidth: CONTENT });
  doc.text("cdsspace.pro", WIDTH - MARGIN, HEIGHT - 18, { align: "right" });

  return doc.output("arraybuffer");
}
