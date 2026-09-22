import "server-only";

import jsPDF from "jspdf";
import sanitizeHtml from "sanitize-html";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";

export interface LegalPdfDocument {
    slug: string;
    title: string;
    subtitle: string | null;
    content: string;
    effective_date: string;
    version: number;
}

type LegalBlock = {
    kind: "heading" | "subheading" | "paragraph" | "list" | "quote" | "table-row";
    text: string;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLUE: [number, number, number] = [10, 79, 232];
const NAVY: [number, number, number] = [7, 19, 59];
const BODY: [number, number, number] = [55, 65, 81];
const MUTED: [number, number, number] = [107, 119, 141];
const STROKE: [number, number, number] = [226, 232, 240];

function decodeHtmlEntities(value: string) {
    const named: Record<string, string> = {
        amp: "&",
        apos: "'",
        gt: ">",
        hellip: "...",
        ldquo: '"',
        lsquo: "'",
        lt: "<",
        mdash: "-",
        nbsp: " ",
        ndash: "-",
        quot: '"',
        rdquo: '"',
        rsquo: "'",
    };

    return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
        if (entity.startsWith("#x") || entity.startsWith("#X")) {
            const value = Number.parseInt(entity.slice(2), 16);
            return Number.isFinite(value) ? String.fromCodePoint(value) : match;
        }
        if (entity.startsWith("#")) {
            const value = Number.parseInt(entity.slice(1), 10);
            return Number.isFinite(value) ? String.fromCodePoint(value) : match;
        }
        return named[entity.toLowerCase()] ?? match;
    });
}

function plainText(value: string) {
    const withoutMarkup = sanitizeHtml(value, {
        allowedTags: [],
        allowedAttributes: {},
        disallowedTagsMode: "discard",
    });
    return decodeHtmlEntities(withoutMarkup)
        .replace(/\u00a0/g, " ")
        .replace(/[ \t\r\f\v]+/g, " ")
        .replace(/\s*\n\s*/g, "\n")
        .trim();
}

/** Convert the sanitised legal HTML into the block types needed for a readable PDF. */
function legalBlocks(html: string): LegalBlock[] {
    const blocks: LegalBlock[] = [];
    const matcher = /<(h2|h3|h4|p|li|blockquote|tr)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;

    while ((match = matcher.exec(html))) {
        const tag = match[1].toLowerCase();
        let body = match[2];
        if (tag === "tr") {
            body = body
                .replace(/<\/(?:th|td)>\s*<(?:th|td)\b[^>]*>/gi, " | ")
                .replace(/<(?:th|td)\b[^>]*>/gi, "")
                .replace(/<\/(?:th|td)>/gi, "");
        } else {
            body = body.replace(/<br\s*\/?>/gi, "\n");
        }

        const text = plainText(body);
        if (!text) continue;
        const kind: LegalBlock["kind"] =
            tag === "h2"
                ? "heading"
                : tag === "h3" || tag === "h4"
                  ? "subheading"
                  : tag === "li"
                    ? "list"
                    : tag === "blockquote"
                      ? "quote"
                      : tag === "tr"
                        ? "table-row"
                        : "paragraph";
        blocks.push({ kind, text });
    }

    if (blocks.length === 0) {
        const fallback = plainText(html.replace(/<br\s*\/?>/gi, "\n"));
        if (fallback) blocks.push({ kind: "paragraph", text: fallback });
    }
    return blocks;
}

export function legalPdfFileName(doc: Pick<LegalPdfDocument, "slug" | "version" | "effective_date">) {
    const version = doc.version > 0 ? `v${doc.version}` : "current";
    return `cds-space-${doc.slug}-${version}-${doc.effective_date}.pdf`;
}

export function buildLegalPdf(source: LegalPdfDocument): ArrayBuffer {
    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
    installBrandFont(doc);
    let y = 0;

    const setFont = (size: number, color: [number, number, number], bold = false, italic = false) => {
        doc.setFont("NeueCampton", bold ? (italic ? "bolditalic" : "bold") : italic ? "italic" : "normal");
        doc.setFontSize(size);
        doc.setTextColor(...color);
    };

    const newPage = () => {
        doc.addPage();
        y = MARGIN;
    };

    const ensureSpace = (height: number) => {
        if (y + height > PAGE_HEIGHT - 68) newPage();
    };

    const writeLines = (text: string, options: {
        size: number;
        color?: [number, number, number];
        bold?: boolean;
        italic?: boolean;
        width?: number;
        indent?: number;
        lineHeight?: number;
        after?: number;
    }) => {
        const width = options.width ?? CONTENT_WIDTH;
        const indent = options.indent ?? 0;
        const lineHeight = options.lineHeight ?? options.size * 1.45;
        setFont(options.size, options.color ?? BODY, options.bold, options.italic);
        const lines = doc.splitTextToSize(text, width) as string[];
        ensureSpace(lines.length * lineHeight + (options.after ?? 0));
        doc.text(lines, MARGIN + indent, y, { lineHeightFactor: lineHeight / options.size });
        y += lines.length * lineHeight + (options.after ?? 0);
    };

    // Branded document header.
    doc.setFillColor(...BLUE);
    doc.rect(0, 0, PAGE_WIDTH, 148, "F");
    setFont(10, [220, 232, 255], true);
    doc.text("CDS Space · Legal", MARGIN, 40);
    setFont(24, [255, 255, 255], true);
    const titleLines = (doc.splitTextToSize(source.title, CONTENT_WIDTH) as string[]).slice(0, 3);
    doc.text(titleLines, MARGIN, 73, { lineHeightFactor: 1.1 });
    y = 174;

    if (source.subtitle) {
        writeLines(source.subtitle, { size: 11, color: BODY, lineHeight: 16, after: 15 });
    }

    setFont(9.5, MUTED);
    const version = source.version > 0 ? `Version ${source.version}` : "Current published version";
    doc.text(`Effective ${formatDate(source.effective_date)}  ·  ${version}`, MARGIN, y);
    y += 20;
    doc.setDrawColor(...STROKE);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 26;

    for (const block of legalBlocks(source.content)) {
        if (block.kind === "heading") {
            ensureSpace(50);
            y += y === MARGIN ? 4 : 12;
            writeLines(block.text, { size: 15, color: NAVY, bold: true, lineHeight: 19, after: 11 });
            continue;
        }
        if (block.kind === "subheading") {
            ensureSpace(36);
            y += 5;
            writeLines(block.text, { size: 11.5, color: NAVY, bold: true, lineHeight: 16, after: 8 });
            continue;
        }
        if (block.kind === "list") {
            ensureSpace(24);
            setFont(10.2, BLUE, true);
            doc.text("•", MARGIN + 2, y);
            writeLines(block.text, { size: 10.2, width: CONTENT_WIDTH - 20, indent: 18, lineHeight: 15, after: 7 });
            continue;
        }
        if (block.kind === "quote") {
            ensureSpace(30);
            doc.setDrawColor(...BLUE);
            doc.setLineWidth(2);
            doc.line(MARGIN + 2, y - 2, MARGIN + 2, y + 20);
            writeLines(block.text, { size: 10.2, color: BODY, italic: true, width: CONTENT_WIDTH - 20, indent: 16, lineHeight: 15, after: 10 });
            continue;
        }
        if (block.kind === "table-row") {
            ensureSpace(28);
            doc.setFillColor(247, 249, 252);
            doc.roundedRect(MARGIN, y - 10, CONTENT_WIDTH, 24, 3, 3, "F");
            writeLines(block.text, { size: 9.5, width: CONTENT_WIDTH - 16, indent: 8, lineHeight: 13, after: 8 });
            continue;
        }
        writeLines(block.text, { size: 10.2, color: BODY, lineHeight: 15, after: 10 });
    }

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(...STROKE);
        doc.setLineWidth(0.5);
        doc.line(MARGIN, PAGE_HEIGHT - 50, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 50);
        setFont(8.5, MUTED);
        doc.text("cdsspace.pro", MARGIN, PAGE_HEIGHT - 32);
        doc.text(`Page ${page} of ${pageCount}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 32, { align: "right" });
    }

    return doc.output("arraybuffer");
}

function formatDate(value: string) {
    try {
        return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
        });
    } catch {
        return value;
    }
}
