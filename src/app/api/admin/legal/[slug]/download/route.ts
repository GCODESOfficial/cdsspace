import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { isLegalSlug } from "@/lib/legal/default-content";
import { buildLegalPdf, legalPdfFileName } from "@/lib/legal/pdf";
import { loadLegalDocument } from "@/lib/legal/server";
import { parseRichText } from "@/lib/rich-text";

export const runtime = "nodejs";

/**
 * Generates a .docx from the current sanitized legal content.
 *
 * The returned Blob/Buffer is a valid .docx that opens in Word, Pages, and
 * Google Docs. After editing, the admin can re-upload via the sibling
 * /upload route which parses it back to HTML with `mammoth`.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const session = await getAdminSessionAsync(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== "super_admin" && !hasPermission(session.permissions, "legal")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { slug } = await params;
    if (!isLegalSlug(slug)) return NextResponse.json({ error: "Unknown document" }, { status: 404 });

    const doc = await loadLegalDocument(slug);

    if (req.nextUrl.searchParams.get("format") === "pdf") {
        const pdf = buildLegalPdf(doc);
        return new NextResponse(new Uint8Array(pdf), {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${legalPdfFileName(doc)}"`,
                "Cache-Control": "private, no-store",
            },
        });
    }

    // Build OOXML directly instead of passing HTML and embedded image URLs to
    // a converter. This keeps document export away from vulnerable image
    // sniffers and prevents an admin-authored document from triggering an
    // unexpected server-side fetch.
    const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");
    const children = [
        new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE }),
        ...(doc.subtitle ? [new Paragraph({ children: [new TextRun({ text: doc.subtitle, italics: true })] })] : []),
        new Paragraph({
            children: [
                new TextRun({ text: "Effective date: ", bold: true }),
                new TextRun(formatDate(doc.effective_date)),
            ],
            spacing: { after: 240 },
        }),
    ];
    for (const node of parseRichText(doc.content)) {
        if (node.kind === "paragraph") {
            children.push(new Paragraph({ text: node.text, spacing: { after: 160 } }));
            continue;
        }
        node.items.forEach((item, index) => {
            children.push(new Paragraph({
                text: node.ordered ? `${index + 1}. ${item}` : item,
                ...(node.ordered ? {} : { bullet: { level: 0 } }),
                spacing: { after: 80 },
            }));
        });
    }
    const document = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(document);

    const filename = `cds-space-${slug}-v${doc.version}-${doc.effective_date}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
        },
    });
}

function formatDate(iso: string) {
    try {
        return new Date(iso).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
        });
    } catch {
        return iso;
    }
}
