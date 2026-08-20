import "server-only";

import jsPDF from "jspdf";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";

export interface GrowthProposalDocument {
  id: string;
  title: string;
  executive_line: string;
  problem: string;
  solution: string;
  deliverables: string[];
  process: string[];
  timeline: string | null;
  investment: string | null;
  call_to_action: string;
  company_name: string;
  campaign_name: string | null;
  service_niche: string | null;
  created_at: string;
}

const BLUE: [number, number, number] = [10, 79, 232];
const DARK: [number, number, number] = [7, 19, 59];
const PALE: [number, number, number] = [239, 245, 255];
const MUTED: [number, number, number] = [112, 129, 163];

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "proposal";
}

export function proposalFileName(proposal: GrowthProposalDocument) {
  return `CDS-Space-${slug(proposal.company_name)}-proposal.pdf`;
}

export function buildGrowthProposalPdf(proposal: GrowthProposalDocument): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape", compress: true });
  installBrandFont(doc);
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 66;

  const brandMark = (light = false) => {
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(17);
    const color: [number, number, number] = light ? [255, 255, 255] : DARK;
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text("CDS SPACE", width - margin, 48, { align: "right" });
    doc.setFont("NeueCampton", "normal");
    doc.setFontSize(8);
    doc.text("BRANDING AGENCY", width - margin, 61, { align: "right" });
  };

  const footer = (page: number, light = false) => {
    const color: [number, number, number] = light ? [187, 211, 255] : MUTED;
    doc.setDrawColor(...color);
    doc.setLineWidth(0.5);
    doc.line(margin, height - 42, width - margin, height - 42);
    doc.setFont("NeueCampton", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...color);
    doc.text("partner with us at cdsspace.pro", margin, height - 24);
    doc.text(String(page).padStart(2, "0"), width - margin, height - 24, { align: "right" });
  };

  const sectionTitle = (eyebrow: string, title: string, light = false) => {
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(9);
    const eyebrowColor: [number, number, number] = light ? [184, 211, 255] : BLUE;
    doc.setTextColor(eyebrowColor[0], eyebrowColor[1], eyebrowColor[2]);
    doc.text(eyebrow.toUpperCase(), margin, 70);
    doc.setFontSize(30);
    const titleColor: [number, number, number] = light ? [255, 255, 255] : DARK;
    doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
    doc.text(title, margin, 111);
  };

  const paragraph = (text: string, x: number, y: number, maxWidth: number, light = false, size = 15) => {
    doc.setFont("NeueCampton", "normal");
    doc.setFontSize(size);
    doc.setLineHeightFactor(1.35);
    const textColor: [number, number, number] = light ? [235, 243, 255] : [44, 61, 96];
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * size * 1.35;
  };

  // 01 / Cover, derived from the supplied blue proposal system.
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, width, height, "F");
  doc.setFillColor(35, 103, 236);
  for (let column = 0; column < 9; column += 1) {
    for (let row = 0; row < 5; row += 1) {
      const radius = 5 + ((column + row) % 3) * 2;
      doc.circle(70 + column * 66, height - 140 + row * 28, radius, "F");
    }
  }
  brandMark(true);
  doc.setFont("NeueCampton", "bold");
  doc.setFontSize(42);
  doc.setTextColor(255, 255, 255);
  const coverTitle = doc.splitTextToSize(proposal.title, width * 0.64);
  doc.text(coverTitle, margin, 155);
  doc.setFont("NeueCampton", "normal");
  doc.setFontSize(17);
  doc.setTextColor(215, 229, 255);
  doc.text(doc.splitTextToSize(proposal.executive_line, width * 0.68), margin, 155 + coverTitle.length * 48 + 18);
  doc.setFontSize(10);
  doc.text(`Prepared for ${proposal.company_name}`, margin, height - 178);
  doc.text(new Date(proposal.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" }), margin, height - 160);
  footer(1, true);

  // 02 / Read of the opportunity.
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, height, "F");
  brandMark();
  sectionTitle("The opportunity", "The business deserves a clearer market signal.");
  paragraph(proposal.executive_line, margin, 160, width * 0.56, false, 20);
  doc.setFillColor(...PALE);
  doc.roundedRect(width * 0.67, 150, width * 0.25, 250, 18, 18, "F");
  doc.setFont("NeueCampton", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BLUE);
  doc.text("FOCUS", width * 0.7, 188);
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  doc.text(doc.splitTextToSize(proposal.service_niche || "Brand infrastructure", width * 0.19), width * 0.7, 228);
  doc.setFont("NeueCampton", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text(doc.splitTextToSize(`Campaign direction: ${proposal.campaign_name || "Focused growth"}`, width * 0.19), width * 0.7, 320);
  footer(2);

  // 03 / Problem.
  doc.addPage();
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, width, height, "F");
  brandMark(true);
  sectionTitle("The problem", "What is slowing the next move?", true);
  paragraph(proposal.problem, margin, 165, width * 0.62, true, 17);
  doc.setFillColor(255, 255, 255);
  doc.circle(width - 112, 205, 88, "F");
  doc.setFillColor(174, 205, 255);
  doc.circle(width - 70, 285, 62, "F");
  doc.setFillColor(219, 232, 255);
  doc.circle(width - 155, 340, 46, "F");
  footer(3, true);

  // 04 / Solution.
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, height, "F");
  brandMark();
  sectionTitle("The direction", "One system. No translation loss.");
  paragraph(proposal.solution, margin, 160, width * 0.84, false, 17);
  const deliverables = proposal.deliverables.slice(0, 6);
  const gap = 12;
  const cardWidth = (width - margin * 2 - gap * 2) / 3;
  deliverables.forEach((item, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = margin + col * (cardWidth + gap);
    const y = 290 + row * 84;
    doc.setFillColor(...PALE);
    doc.roundedRect(x, y, cardWidth, 68, 10, 10, "F");
    doc.setFillColor(...BLUE);
    doc.rect(x, y, 5, 68, "F");
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text(doc.splitTextToSize(item, cardWidth - 30), x + 19, y + 28);
  });
  footer(4);

  // 05 / Process.
  doc.addPage();
  doc.setFillColor(...DARK);
  doc.rect(0, 0, width, height, "F");
  brandMark(true);
  sectionTitle("How we work", "Five stages. Same order. Every time.", true);
  const process = (proposal.process.length ? proposal.process : ["Research", "Strategy", "System", "Execution", "Documentation"]).slice(0, 5);
  const stageWidth = (width - margin * 2 - 48) / process.length;
  process.forEach((item, index) => {
    const x = margin + index * (stageWidth + 12);
    doc.setFillColor(index === 0 ? BLUE[0] : 22, index === 0 ? BLUE[1] : 39, index === 0 ? BLUE[2] : 82);
    doc.roundedRect(x, 185, stageWidth, 180, 12, 12, "F");
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(10);
    doc.setTextColor(141, 180, 255);
    doc.text(String(index + 1).padStart(2, "0"), x + 18, 217);
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(doc.splitTextToSize(item, stageWidth - 36), x + 18, 272);
  });
  footer(5, true);

  // 06 / Next step.
  doc.addPage();
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, width, height, "F");
  brandMark(true);
  sectionTitle("Next move", "Start with the highest-leverage question.", true);
  paragraph(proposal.call_to_action, margin, 170, width * 0.7, true, 21);
  doc.setDrawColor(146, 187, 255);
  doc.roundedRect(margin, 310, width - margin * 2, 95, 14, 14, "S");
  doc.setFont("NeueCampton", "bold");
  doc.setFontSize(10);
  doc.setTextColor(185, 212, 255);
  doc.text("TIMELINE", margin + 24, 341);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text(doc.splitTextToSize(proposal.timeline || "Scope and quote confirmed within 48 hours of the working session.", width * 0.39), margin + 24, 366);
  doc.setFontSize(10);
  doc.setTextColor(185, 212, 255);
  doc.text("INVESTMENT", width * 0.55, 341);
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(doc.splitTextToSize(proposal.investment || "Scoped to the agreed outcome and delivery depth.", width * 0.35), width * 0.55, 366);
  footer(6, true);

  return doc.output("arraybuffer");
}
