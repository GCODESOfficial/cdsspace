import "server-only";

import jsPDF from "jspdf";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";
import type { DealProposalContent } from "@/lib/deals-ai";

export interface DealProposalDocument {
  brand_name: string;
  title: string;
  focus_area: string;
  target_url: string | null;
  created_at: string;
  content: DealProposalContent;
  sources: Array<{ title?: string; url: string; kind?: string }>;
}

const BLUE: [number, number, number] = [10, 79, 232];
const INK: [number, number, number] = [7, 19, 59];
const MUTED: [number, number, number] = [92, 108, 139];
const PALE: [number, number, number] = [242, 246, 253];

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "proposal";
}

export function dealProposalFileName(proposal: DealProposalDocument) {
  return `CDS-Space-${slug(proposal.brand_name)}-proposal.pdf`;
}

export function buildDealProposalPdf(proposal: DealProposalDocument, cover?: { bytes: Uint8Array; mime: string } | null): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  installBrandFont(doc);
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 54;

  const brand = (light = false) => {
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...(light ? [255, 255, 255] as [number, number, number] : INK));
    doc.text("CDS Space", width - margin, 40, { align: "right" });
  };
  const footer = (page: number, light = false) => {
    const color = light ? [205, 222, 255] as [number, number, number] : MUTED;
    doc.setDrawColor(...color);
    doc.line(margin, height - 42, width - margin, height - 42);
    doc.setFont("NeueCampton", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...color);
    doc.text("cdsspace.pro", margin, height - 25);
    doc.text(String(page), width - margin, height - 25, { align: "right" });
  };
  const heading = (eyebrow: string, title: string) => {
    brand();
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BLUE);
    doc.text(eyebrow, margin, 75);
    doc.setFontSize(25);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(title, width - margin * 2), margin, 112);
  };
  const paragraph = (text: string, x: number, y: number, maxWidth: number, size = 12) => {
    doc.setFont("NeueCampton", "normal");
    doc.setFontSize(size);
    doc.setLineHeightFactor(1.45);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(text || "Not provided", maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * size * 1.45;
  };
  const list = (items: string[], x: number, y: number, maxWidth: number) => {
    let cursor = y;
    items.forEach((item) => {
      doc.setFillColor(...BLUE);
      doc.circle(x + 4, cursor - 4, 3, "F");
      cursor = paragraph(item, x + 17, cursor, maxWidth - 17, 11) + 8;
    });
    return cursor;
  };

  let customCover = false;
  if (cover?.bytes?.length) {
    try {
      const format = cover.mime.includes("png") ? "PNG" : cover.mime.includes("webp") ? "WEBP" : "JPEG";
      doc.addImage(cover.bytes, format, 0, 0, width, height, undefined, "FAST");
      customCover = true;
    } catch {
      customCover = false;
    }
  }
  if (!customCover) {
    doc.setFillColor(...BLUE);
    doc.rect(0, 0, width, height, "F");
    brand(true);
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(36);
    doc.setTextColor(255, 255, 255);
    doc.text(doc.splitTextToSize(proposal.title, width - margin * 2), margin, 165);
    doc.setFont("NeueCampton", "normal");
    doc.setFontSize(14);
    doc.setTextColor(218, 231, 255);
    doc.text(doc.splitTextToSize(`Prepared for ${proposal.brand_name}`, width - margin * 2), margin, 300);
    doc.text(new Date(proposal.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), margin, 330);
    footer(1, true);
  }

  doc.addPage();
  heading("Executive summary", "A focused direction for the next stage.");
  paragraph(proposal.content.executive_summary, margin, 170, width - margin * 2, 15);
  doc.setFillColor(...PALE);
  doc.roundedRect(margin, 410, width - margin * 2, 150, 14, 14, "F");
  doc.setFont("NeueCampton", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BLUE);
  doc.text("Engagement focus", margin + 22, 442);
  paragraph(proposal.focus_area, margin + 22, 470, width - margin * 2 - 44, 12);
  footer(2);

  doc.addPage();
  heading("Current state", "What the public evidence indicates.");
  let y = paragraph(proposal.content.current_state, margin, 172, width - margin * 2, 13) + 28;
  doc.setFont("NeueCampton", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text("The opportunity", margin, y);
  y = paragraph(proposal.content.opportunity, margin, y + 30, width - margin * 2, 13);
  if (proposal.content.market_metrics.length) {
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text("Evidence-led market signals", margin, Math.min(y + 30, 605));
    list(proposal.content.market_metrics.slice(0, 3).map((item) => `${item.label}: ${item.value}. ${item.context}`), margin, Math.min(y + 58, 635), width - margin * 2);
  }
  footer(3);

  doc.addPage();
  heading("Proposed approach", "Turn the opportunity into a usable system.");
  y = paragraph(proposal.content.proposed_approach, margin, 170, width - margin * 2, 13) + 28;
  doc.setFont("NeueCampton", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text("Deliverables", margin, y);
  list(proposal.content.deliverables.slice(0, 9), margin, y + 30, width - margin * 2);
  footer(4);

  doc.addPage();
  heading("Expected impact", "A practical basis for better communication.");
  y = list(proposal.content.expected_impact.slice(0, 8), margin, 170, width - margin * 2) + 16;
  doc.setFont("NeueCampton", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text("Timeline", margin, y);
  y = paragraph(proposal.content.timeline, margin, y + 28, width - margin * 2, 12) + 24;
  doc.setFont("NeueCampton", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text("Next step", margin, y);
  paragraph(proposal.content.next_step, margin, y + 28, width - margin * 2, 12);
  footer(5);

  if (proposal.sources.length) {
    doc.addPage();
    heading("Sources", "Public evidence used in this proposal.");
    list(proposal.sources.slice(0, 12).map((source) => `${source.title || "Public source"}: ${source.url}`), margin, 170, width - margin * 2);
    footer(6);
  }

  return doc.output("arraybuffer");
}
