import "server-only";

import jsPDF from "jspdf";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";
import type { DealAuditContent } from "@/lib/deals-ai";
import { auditChartData, SEVERITY, TOUCHPOINT_STATE, type AuditStateKey } from "@/lib/audit-charts";

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

export function buildDealAuditPdf(audit: DealAuditDocument): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  installBrandFont(doc);
  const content = audit.content || ({} as DealAuditContent);
  const chart = auditChartData(content, audit.overall_score);
  let y = 0;

  /**
   * jsPDF has no arc primitive, so the gauge is drawn as short round-capped
   * segments along the sweep. At this radius they read as one smooth ring.
   */
  const arc = (cx: number, cy: number, radius: number, fromDeg: number, toDeg: number, width: number, color: [number, number, number]) => {
    if (toDeg <= fromDeg) return;
    // Angles are clockwise from twelve o'clock, so the sweep reads like a dial.
    const point = (deg: number) => {
      const radians = (deg * Math.PI) / 180;
      return [cx + Math.sin(radians) * radius, cy - Math.cos(radians) * radius] as const;
    };
    const steps = Math.max(2, Math.ceil((toDeg - fromDeg) / 3));
    doc.setDrawColor(...color);
    doc.setLineWidth(width);
    doc.setLineCap("round");
    for (let step = 0; step < steps; step += 1) {
      const [x1, y1] = point(fromDeg + ((toDeg - fromDeg) * step) / steps);
      const [x2, y2] = point(fromDeg + ((toDeg - fromDeg) * (step + 1)) / steps);
      doc.line(x1, y1, x2, y2);
    }
    doc.setLineCap("butt");
  };

  const setText = (color: [number, number, number], size: number, bold = false) => {
    doc.setFont("NeueCampton", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const lines = (value: string, width: number) => doc.splitTextToSize(value || "", width) as string[];

  /** Starts a new page whenever the next block would run off the bottom. */
  const room = (needed: number) => {
    if (y + needed <= HEIGHT - MARGIN) return;
    doc.addPage();
    y = MARGIN;
  };

  const paragraph = (value: string, size = 10, color: [number, number, number] = BODY, bold = false, width = CONTENT, indent = 0) => {
    if (!value) return;
    setText(color, size, bold);
    const rows = lines(value, width);
    for (const row of rows) {
      room(size + 4);
      doc.text(row, MARGIN + indent, y);
      y += size + 4;
    }
  };

  /**
   * Every section opens its own page. A section that ran on from the previous
   * one used to be cut in half by the page break; giving each its own page
   * costs a little paper and makes the document readable straight through.
   */
  const heading = (value: string) => {
    doc.addPage();
    y = MARGIN + 14;
    setText(INK, 16, true);
    doc.text(value, MARGIN, y);
    y += 10;
    doc.setDrawColor(...PALE);
    doc.setLineWidth(1.5);
    doc.line(MARGIN, y, MARGIN + CONTENT, y);
    y += 22;
  };

  // Cover band.
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, WIDTH, 190, "F");
  setText([255, 255, 255], 10, true);
  doc.text("CDS SPACE BRAND AUDIT", MARGIN, 56);
  setText([255, 255, 255], 24, true);
  for (const row of lines(audit.brand_name, CONTENT - 110).slice(0, 2)) {
    doc.text(row, MARGIN, 90 + (lines(audit.brand_name, CONTENT - 110).indexOf(row) * 28));
  }
  setText([222, 234, 255], 9.5);
  doc.text(audit.target_url || "", MARGIN, 150);
  doc.text(new Date(audit.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), MARGIN, 166);
  // The score as a three-quarter arc, opened at the bottom so the figure reads
  // as the headline rather than a label on a ring.
  if (audit.overall_score !== null) {
    const cx = WIDTH - MARGIN - 46;
    const cy = 100;
    // The unfilled track is a solid tint of the band rather than white at low
    // opacity, which this jsPDF build does not honour on strokes.
    arc(cx, cy, 38, 225, 495, 11, GAUGE_TRACK);
    arc(cx, cy, 38, 225, 225 + (270 * chart.score) / 100, 11, [255, 255, 255]);
    setText([255, 255, 255], 28, true);
    doc.text(String(chart.score), cx, cy + 6, { align: "center" });
    setText([222, 234, 255], 8);
    doc.text("out of 100", cx, cy + 22, { align: "center" });
  }
  y = 220;

  paragraph(content.summary || "", 11, BODY);

  /** The stacked distribution of touchpoint states, with its own legend. */
  const healthBar = () => {
    if (!chart.touchpointTotal) return;
    setText(INK, 10.5, true);
    doc.text("Touchpoint health", MARGIN, y);
    setText(MUTED, 9.5);
    doc.text(`${chart.healthy} of ${chart.touchpointTotal} working as they should`, MARGIN + CONTENT, y, { align: "right" });
    y += 10;
    let x = MARGIN;
    for (const state of chart.states) {
      const width = Math.max(4, state.share * (CONTENT - Math.max(0, chart.states.length - 1) * 2));
      doc.setFillColor(...rgb(state.color));
      doc.roundedRect(x, y, width, 9, 4, 4, "F");
      x += width + 2;
    }
    y += 22;
    let legendX = MARGIN;
    for (const state of chart.states) {
      const text = `${state.label}  ${state.count}`;
      setText(BODY, 9);
      const width = doc.getTextWidth(text) + 18;
      if (legendX + width > MARGIN + CONTENT) { legendX = MARGIN; y += 15; }
      doc.setFillColor(...rgb(state.color));
      doc.circle(legendX + 3.5, y - 3, 3.5, "F");
      setText(BODY, 9);
      doc.text(text, legendX + 12, y);
      legendX += width;
    }
    y += 20;
  };

  /** Findings by severity. Three counts, so tiles rather than a chart. */
  const severityTiles = () => {
    if (!chart.severities.length) return;
    const gap = 10;
    const width = (CONTENT - gap * (chart.severities.length - 1)) / chart.severities.length;
    chart.severities.forEach((severity, index) => {
      const left = MARGIN + index * (width + gap);
      doc.setFillColor(...PALE);
      doc.roundedRect(left, y, width, 54, 8, 8, "F");
      doc.setFillColor(...rgb(severity.color));
      doc.circle(left + 15, y + 18, 3.5, "F");
      setText(MUTED, 8.5, true);
      doc.text(`${severity.label.toUpperCase()} SEVERITY`, left + 24, y + 21);
      setText(INK, 20, true);
      const countWidth = doc.getTextWidth(String(severity.count));
      doc.text(String(severity.count), left + 14, y + 45);
      setText(MUTED, 8);
      doc.text(`of ${chart.findingsTotal} findings`, left + 14 + countWidth + 7, y + 45);
    });
    y += 76;
  };

  /**
   * The cover page carries the whole picture: the score, the summary, how the
   * touchpoints sit and what the findings weigh. Everything after it is one
   * section per page.
   */
  if (chart.touchpointTotal || chart.severities.length) {
    y += 22;
    setText(INK, 13, true);
    doc.text("At a glance", MARGIN, y);
    y += 8;
    doc.setDrawColor(...PALE);
    doc.setLineWidth(1.5);
    doc.line(MARGIN, y, MARGIN + CONTENT, y);
    y += 24;
    healthBar();
    if (chart.severities.length) { y += 6; severityTiles(); }
  }

  if (chart.scores.length) {
    heading("Scorecard");
    paragraph("Each area out of 100, strongest first.", 9.5, MUTED);
    y += 10;
    for (const item of chart.scores) {
      room(50);
      setText(INK, 10, true);
      doc.text(item.area, MARGIN, y);
      setText(BLUE, 10, true);
      doc.text(String(item.score), MARGIN + CONTENT, y, { align: "right" });
      y += 8;
      doc.setFillColor(...PALE);
      doc.roundedRect(MARGIN, y, CONTENT, 6, 3, 3, "F");
      const width = (item.score / 100) * CONTENT;
      if (width > 0) {
        doc.setFillColor(...BLUE);
        doc.roundedRect(MARGIN, y, Math.max(width, 6), 6, 3, 3, "F");
      }
      y += 21;
      paragraph(item.explanation, 9, MUTED);
      y += 8;
    }
  }

  if (content.touchpoints?.length) {
    heading("Every touchpoint");
    healthBar();
    y += 8;

    for (const touchpoint of content.touchpoints) {
      room(76);
      const shape = TOUCHPOINT_STATE[touchpoint.state as AuditStateKey] || TOUCHPOINT_STATE.unknown;
      doc.setFillColor(...rgb(shape.color));
      doc.circle(MARGIN + 3.5, y - 3.5, 3.5, "F");
      setText(INK, 10.5, true);
      doc.text(touchpoint.label, MARGIN + 13, y);
      setText(MUTED, 9, true);
      doc.text(shape.label.toUpperCase(), MARGIN + CONTENT, y, { align: "right" });
      y += 14;
      paragraph(touchpoint.observation, 9.5, BODY, false, CONTENT - 13, 13);
      if (touchpoint.fix) paragraph(`What to do: ${touchpoint.fix}`, 9, MUTED, false, CONTENT - 13, 13);
      y += 10;
    }
  }

  if (content.findings?.length) {
    heading("Findings");
    severityTiles();
    y += 6;

    for (const finding of content.findings) {
      room(60);
      const tone = SEVERITY_COLOR[String(finding.severity)] || SEVERITY_COLOR.low;
      doc.setFillColor(...rgb(tone));
      doc.circle(MARGIN + 3.5, y - 3.5, 3.5, "F");
      setText(INK, 10.5, true);
      doc.text(finding.title, MARGIN + 13, y);
      setText(MUTED, 9, true);
      doc.text(String(finding.severity || "").toUpperCase(), MARGIN + CONTENT, y, { align: "right" });
      y += 14;
      paragraph(finding.evidence, 9.5, BODY, false, CONTENT - 13, 13);
      paragraph(finding.source_url, 8, MUTED, false, CONTENT - 13, 13);
      y += 10;
    }
  }

  if (content.recommendations?.length) {
    heading("Priority actions");
    for (const item of [...content.recommendations].sort((a, b) => a.priority - b.priority)) {
      room(60);
      doc.setFillColor(...BLUE);
      doc.circle(MARGIN + 8, y - 3, 8, "F");
      setText([255, 255, 255], 9, true);
      doc.text(String(item.priority), MARGIN + 8, y, { align: "center" });
      setText(INK, 10.5, true);
      doc.text(item.title, MARGIN + 26, y);
      y += 14;
      paragraph(item.action, 9.5, BODY, false, CONTENT - 26, 26);
      if (item.expected_outcome) paragraph(`Expected outcome: ${item.expected_outcome}`, 9, MUTED, false, CONTENT - 26, 26);
      y += 8;
    }
  }

  if (content.future_state) {
    heading("What it can become");
    paragraph(content.future_state, 10.5, BODY);
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    setText(MUTED, 8);
    doc.text("Prepared by CDS Space from publicly available evidence.", MARGIN, HEIGHT - 24);
    doc.text(`${page} / ${pages}`, WIDTH - MARGIN, HEIGHT - 24, { align: "right" });
  }

  return doc.output("arraybuffer");
}
