import "server-only";

import jsPDF from "jspdf";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";
import {
  PROCESS_PAYOFF,
  PROCESS_PROBLEMS,
  PROCESS_STAGES,
  PROPOSAL_ART,
  type ProposalArtKey,
  type ProposalDeck,
} from "@/lib/proposal-deck";
import { renderProposalArt } from "@/lib/proposal-art";

export interface DealProposalDocument {
  brand_name: string;
  title: string;
  focus_area: string;
  target_url: string | null;
  created_at: string;
  deck: ProposalDeck;
}

const BLUE: [number, number, number] = [0, 80, 219];
const INK: [number, number, number] = [7, 19, 59];
const BODY: [number, number, number] = [31, 42, 68];
const MUTED: [number, number, number] = [92, 108, 139];
const PALE: [number, number, number] = [237, 243, 254];
const PALE_DEEP: [number, number, number] = [220, 232, 252];

// 16:9 slide, expressed in points.
const WIDTH = 960;
const HEIGHT = 540;
const MARGIN = 54;

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "proposal";
}

export function dealProposalFileName(proposal: { brand_name: string }) {
  return `CDS-Space-${slug(proposal.brand_name)}-proposal.pdf`;
}

export async function buildDealProposalPdf(
  proposal: DealProposalDocument,
  cover?: { bytes: Uint8Array; mime: string } | null,
): Promise<ArrayBuffer> {
  const doc = new jsPDF({ unit: "pt", format: [WIDTH, HEIGHT], orientation: "landscape", compress: true });
  installBrandFont(doc);
  const deck = proposal.deck;

  const setText = (color: [number, number, number], size: number, bold = false) => {
    doc.setFont("NeueCampton", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const wrap = (value: string, maxWidth: number, size: number, bold = false) => {
    doc.setFont("NeueCampton", bold ? "bold" : "normal");
    doc.setFontSize(size);
    return doc.splitTextToSize(value || "", maxWidth) as string[];
  };

  const paragraph = (
    value: string,
    x: number,
    y: number,
    maxWidth: number,
    options: { size?: number; color?: [number, number, number]; bold?: boolean; leading?: number } = {},
  ) => {
    const size = options.size ?? 12;
    const leading = options.leading ?? 1.45;
    const lines = wrap(value, maxWidth, size, options.bold);
    setText(options.color ?? BODY, size, options.bold);
    doc.setLineHeightFactor(leading);
    doc.text(lines, x, y);
    return y + lines.length * size * leading;
  };

  const bullets = (
    items: readonly string[],
    x: number,
    y: number,
    maxWidth: number,
    options: { size?: number; color?: [number, number, number]; dot?: [number, number, number]; gap?: number } = {},
  ) => {
    const size = options.size ?? 11;
    let cursor = y;
    items.forEach((item) => {
      doc.setFillColor(...(options.dot ?? BLUE));
      doc.circle(x + 2.5, cursor - size * 0.32, 2.4, "F");
      cursor = paragraph(item, x + 13, cursor, maxWidth - 13, { size, color: options.color ?? BODY, leading: 1.4 }) + (options.gap ?? 7);
    });
    return cursor;
  };

  const footer = (page: number, dark = false, note?: string) => {
    const line: [number, number, number] = dark ? [255, 255, 255] : [185, 208, 247];
    const barY = HEIGHT - 62;
    const barWidth = WIDTH - MARGIN * 2 - 34;
    if (note) {
      // A slide with its own footnote runs it in the footer row so it sits
      // beside the page number rather than on top of it.
      doc.setFillColor(...BLUE);
      doc.roundedRect(MARGIN, barY, barWidth, 26, 5, 5, "F");
      setText([255, 255, 255], 9, true);
      doc.text(wrap(note, barWidth - 28, 9, true)[0] || "", MARGIN + 14, barY + 17);
    } else {
      doc.setDrawColor(...line);
      doc.setLineWidth(0.8);
      doc.roundedRect(MARGIN, barY, barWidth, 26, 5, 5, "S");
      setText(dark ? [255, 255, 255] : BLUE, 9);
      doc.text("partner with us at cdsspace.pro", MARGIN + 14, barY + 17);
    }
    if (dark) doc.setFillColor(255, 255, 255); else doc.setFillColor(...BLUE);
    doc.roundedRect(WIDTH - MARGIN - 28, barY, 28, 26, 5, 5, "F");
    setText(dark ? BLUE : [255, 255, 255], 9, true);
    doc.text(String(page).padStart(2, "0"), WIDTH - MARGIN - 14, barY + 17, { align: "center" });
  };

  const slide = (dark: boolean) => {
    doc.setFillColor(...(dark ? BLUE : [255, 255, 255] as [number, number, number]));
    doc.rect(0, 0, WIDTH, HEIGHT, "F");
  };

  const heading = (value: string, dark = false) => {
    setText(dark ? [255, 255, 255] : BLUE, 27, true);
    doc.setLineHeightFactor(1.12);
    const lines = wrap(value, WIDTH - MARGIN * 2, 27, true);
    doc.text(lines, MARGIN, 84);
    return 84 + lines.length * 27 * 1.12;
  };

  /* Artwork placement, in slide points. Mirrors the web deck's percentages so
   * print and screen frame each illustration identically. Standalone artwork is
   * letterboxed inside its box the same way the web deck's `object-fit:
   * contain` does, so nothing is stretched. */
  const ART_BOXES: Record<ProposalArtKey, { x: number; y: number; w: number; h: number }> = {
    worldMap: { x: 0, y: HEIGHT * 0.3, w: WIDTH, h: HEIGHT * 0.7 },
    flag: { x: WIDTH * 0.6, y: HEIGHT * 0.04, w: WIDTH * 0.4, h: HEIGHT * 0.78 },
    people: { x: WIDTH * 0.66, y: HEIGHT * 0.12, w: WIDTH * 0.34, h: HEIGHT * 0.66 },
    puzzle: { x: WIDTH * 0.66, y: 0, w: WIDTH * 0.34, h: HEIGHT * 0.78 },
    keyhole: { x: WIDTH * 0.68, y: HEIGHT * 0.08, w: WIDTH * 0.32, h: HEIGHT * 0.76 },
  };

  /** The box the artwork actually occupies once it is letterboxed and centred. */
  const fittedBox = (key: ProposalArtKey) => {
    const box = ART_BOXES[key];
    const source = PROPOSAL_ART[key];
    if ("crop" in source) return box;
    const scale = Math.min(box.w / source.w, box.h / source.h);
    const w = source.w * scale;
    const h = source.h * scale;
    return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
  };

  // Rasterize every image up front so the drawing pass stays synchronous.
  const artEntries = await Promise.all(
    (Object.keys(ART_BOXES) as ProposalArtKey[]).map(async (key) => {
      const box = fittedBox(key);
      return [key, await renderProposalArt(key, box.w, box.h)] as const;
    }),
  );
  const artwork = new Map(artEntries);

  const art = (key: ProposalArtKey) => {
    const bytes = artwork.get(key);
    if (!bytes) return;
    const box = fittedBox(key);
    try {
      doc.addImage(bytes, "PNG", box.x, box.y, box.w, box.h, key, "FAST");
    } catch {
      /* decorative only - never block the export */
    }
  };

  // 1. Cover
  let usedCoverImage = false;
  if (cover?.bytes?.length) {
    try {
      const format = cover.mime.includes("png") ? "PNG" : cover.mime.includes("webp") ? "WEBP" : "JPEG";
      doc.addImage(cover.bytes, format, 0, 0, WIDTH, HEIGHT, undefined, "FAST");
      usedCoverImage = true;
    } catch {
      usedCoverImage = false;
    }
  }
  if (!usedCoverImage) {
    slide(true);
    art("worldMap");
    setText([255, 255, 255], 40, true);
    doc.setLineHeightFactor(1.08);
    const titleLines = wrap(deck.cover.title, WIDTH - MARGIN * 2 - 150, 40, true);
    doc.text(titleLines, MARGIN, 120);
    paragraph(deck.cover.subtitle, MARGIN, 130 + titleLines.length * 40 * 1.08, WIDTH - MARGIN * 2 - 150, { size: 17, color: [226, 236, 255] });
    setText([255, 255, 255], 12, true);
    doc.text(`Prepared for ${deck.cover.prepared_for || proposal.brand_name}`, MARGIN, HEIGHT - 110);
    setText([210, 226, 255], 11);
    doc.text(
      new Date(proposal.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      MARGIN,
      HEIGHT - 92,
    );
  }

  // 2. Who We Are
  doc.addPage();
  slide(false);
  art("flag");
  let y = heading(deck.who_we_are.heading) + 18;
  deck.who_we_are.body.forEach((entry) => {
    y = paragraph(entry, MARGIN, y, WIDTH - MARGIN * 2 - 220, { size: 12.5 }) + 12;
  });
  footer(2);

  // 3. The Big Picture
  doc.addPage();
  slide(false);
  art("people");
  y = heading(deck.big_picture.heading) + 16;
  y = paragraph(deck.big_picture.intro, MARGIN, y, WIDTH - MARGIN * 2 - 200, { size: 12.5 }) + 16;
  deck.big_picture.outcomes.forEach((outcome) => {
    doc.setFillColor(...BLUE);
    doc.circle(MARGIN + 2.5, y - 4, 2.4, "F");
    y = paragraph(outcome.title, MARGIN + 13, y, WIDTH - MARGIN * 2 - 213, { size: 12.5, bold: true, color: INK });
    y = paragraph(outcome.detail, MARGIN + 13, y + 4, WIDTH - MARGIN * 2 - 213, { size: 11, color: MUTED }) + 10;
  });
  footer(3);

  // 4. Rewind
  doc.addPage();
  slide(true);
  art("puzzle");
  y = heading(deck.rewind.heading, true) + 16;
  y = paragraph(deck.rewind.intro, MARGIN, y, WIDTH - MARGIN * 2 - 240, { size: 13, color: [226, 236, 255] }) + 14;
  bullets(deck.rewind.problems, MARGIN, y, WIDTH - MARGIN * 2 - 240, { size: 11.5, color: [240, 245, 255], dot: [255, 255, 255] });
  footer(4, true);

  // 5. The Opportunities
  doc.addPage();
  slide(false);
  y = heading(deck.opportunities.heading) + 14;
  y = paragraph(deck.opportunities.intro, MARGIN, y, WIDTH - MARGIN * 2 - 200, { size: 12 }) + 14;
  const tones: Array<[number, number, number]> = [[0, 80, 219], [44, 107, 240], [90, 141, 246], [127, 168, 248]];
  const cardWidth = (WIDTH - MARGIN * 2 - 12) / 2;
  const cardHeight = 96;
  deck.opportunities.items.slice(0, 4).forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const cardX = MARGIN + column * (cardWidth + 12);
    const cardY = y + row * (cardHeight + 12);
    doc.setFillColor(...tones[index % tones.length]);
    doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 8, 8, "F");
    setText([255, 255, 255], 12.5, true);
    doc.text(wrap(item.title, cardWidth - 32, 12.5, true).slice(0, 2), cardX + 16, cardY + 24);
    paragraph(item.detail, cardX + 16, cardY + 46, cardWidth - 32, { size: 10, color: [230, 239, 255], leading: 1.35 });
    if (item.value) {
      setText([255, 255, 255], 9, true);
      doc.text(item.value, cardX + 16, cardY + cardHeight - 14);
    }
  });
  footer(5);

  // 6. Our Process
  doc.addPage();
  slide(false);
  setText(BLUE, 22, true);
  doc.text(deck.process.heading, MARGIN, 62);
  setText(BODY, 10);
  doc.text(deck.process.intro, MARGIN, 80);

  const tableX = 34;
  const tableY = 96;
  const tableWidth = WIDTH - tableX * 2;
  const tableHeight = 352;
  const columns = 7;
  const columnWidth = tableWidth / columns;
  const columnData: Array<{ title: string; caption: string; dark: boolean; summary?: string; listLabel?: string; items: readonly string[]; output?: string }> = [
    { title: "The Problem", caption: "Could be but not limited to", dark: true, items: PROCESS_PROBLEMS },
    ...PROCESS_STAGES.map((stage) => ({
      title: stage.step,
      caption: stage.caption,
      dark: false,
      summary: stage.summary,
      listLabel: stage.listLabel,
      items: stage.items,
      output: stage.output,
    })),
    { title: "The Payoff", caption: "True value for investment", dark: true, items: PROCESS_PAYOFF },
  ];

  columnData.forEach((column, index) => {
    const x = tableX + index * columnWidth;
    const isEdge = index === 0 || index === columns - 1;
    doc.setFillColor(...(isEdge ? PALE_DEEP : PALE));
    doc.rect(x + 1, tableY, columnWidth - 2, tableHeight, "F");
    doc.setFillColor(...(column.dark ? BLUE : PALE_DEEP));
    doc.rect(x + 1, tableY, columnWidth - 2, 34, "F");
    setText(column.dark ? [255, 255, 255] : INK, 9.5, true);
    doc.text(column.title, x + 9, tableY + 15);
    setText(column.dark ? [219, 232, 255] : MUTED, 6.6);
    doc.text(wrap(column.caption, columnWidth - 18, 6.6).slice(0, 2), x + 9, tableY + 25);

    let cursor = tableY + 48;
    if (column.summary) {
      cursor = paragraph(column.summary, x + 9, cursor, columnWidth - 18, { size: 7, color: [58, 74, 107], leading: 1.4 }) + 8;
    }
    if (column.listLabel) {
      setText(BLUE, 7.2, true);
      doc.text(column.listLabel, x + 9, cursor);
      cursor += 10;
    }
    cursor = bullets(column.items, x + 9, cursor, columnWidth - 18, { size: 7, color: BODY, gap: 3 });
    if (column.output) {
      setText(BLUE, 7.2, true);
      doc.text("Output", x + 9, tableY + tableHeight - 34);
      setText(INK, 7.2);
      doc.text(wrap(column.output, columnWidth - 18, 7.2).slice(0, 2), x + 9, tableY + tableHeight - 24);
    }
  });

  footer(6, false, deck.process.duration_note);

  // 7. The Payoff
  doc.addPage();
  slide(true);
  art("keyhole");
  y = heading(deck.payoff.heading, true) + 14;
  y = paragraph(deck.payoff.intro, MARGIN, y, WIDTH - MARGIN * 2 - 240, { size: 12.5, color: [226, 236, 255] }) + 14;
  const payoffColumnWidth = (WIDTH - MARGIN * 2 - 240) / 2;
  const half = Math.ceil(deck.payoff.items.length / 2);
  bullets(deck.payoff.items.slice(0, half), MARGIN, y, payoffColumnWidth, { size: 11, color: [240, 245, 255], dot: [255, 255, 255] });
  bullets(deck.payoff.items.slice(half), MARGIN + payoffColumnWidth + 24, y, payoffColumnWidth, { size: 11, color: [240, 245, 255], dot: [255, 255, 255] });
  footer(7, true);

  // 8. Kickoff
  doc.addPage();
  slide(false);
  y = heading(deck.kickoff.heading) + 14;
  y = paragraph(deck.kickoff.intro, MARGIN, y, WIDTH - MARGIN * 2 - 200, { size: 12 }) + 18;
  const steps = deck.kickoff.steps.slice(0, 5);
  const stepGap = 12;
  const stepWidth = (WIDTH - MARGIN * 2 - stepGap * (steps.length - 1)) / Math.max(1, steps.length);
  steps.forEach((step, index) => {
    const x = MARGIN + index * (stepWidth + stepGap);
    doc.setFillColor(...(index === 0 ? BLUE : PALE));
    doc.roundedRect(x, y, stepWidth, 150, 8, 8, "F");
    doc.setFillColor(...(index === 0 ? [255, 255, 255] as [number, number, number] : BLUE));
    doc.circle(x + 22, y + 24, 11, "F");
    setText(index === 0 ? BLUE : [255, 255, 255], 10, true);
    doc.text(String(index + 1), x + 22, y + 27.5, { align: "center" });
    setText(index === 0 ? [255, 255, 255] : INK, 10.5, true);
    doc.text(wrap(step.title, stepWidth - 28, 10.5, true).slice(0, 3), x + 14, y + 56);
    paragraph(step.detail, x + 14, y + 92, stepWidth - 28, { size: 8.5, color: index === 0 ? [226, 236, 255] : MUTED, leading: 1.35 });
  });
  footer(8);

  // 9. Call to action
  doc.addPage();
  slide(true);
  y = heading(deck.cta.heading, true) + 14;
  y = paragraph(deck.cta.body, MARGIN, y, WIDTH - MARGIN * 2, { size: 13, color: [226, 236, 255] }) + 24;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGIN, y, 190, 40, 20, 20, "F");
  setText(BLUE, 12, true);
  doc.text(deck.cta.primary_label, MARGIN + 95, y + 25, { align: "center" });
  setText([219, 232, 255], 11);
  doc.textWithLink(deck.cta.primary_url, MARGIN, y + 70, { url: deck.cta.primary_url });
  doc.text(deck.cta.email, MARGIN, y + 88);
  // The closing slide runs without footer chrome - the call to action already
  // carries the URL, and the deck ends here so the page count adds nothing.

  return doc.output("arraybuffer");
}
