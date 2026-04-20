import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { isLegalSlug } from "@/lib/legal/default-content";
import { loadLegalDocument } from "@/lib/legal/server";

export const runtime = "nodejs";

/**
 * Generates a .docx from the current HTML content. Uses `html-to-docx`, a
 * pure-JS package that writes an Office Open XML file in-memory.
 *
 * The returned Blob/Buffer is a valid .docx that opens in Word, Pages, and
 * Google Docs. After editing, the admin can re-upload via the sibling
 * /upload route which parses it back to HTML with `mammoth`.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const session = getAdminSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.permissions, "legal")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { slug } = await params;
    if (!isLegalSlug(slug)) return NextResponse.json({ error: "Unknown document" }, { status: 404 });

    const doc = await loadLegalDocument(slug);

    // html-to-docx has no TypeScript types bundled, and different versions
    // export as default vs named. Resolve either shape.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const htmlToDocxModule: any = await import("html-to-docx");
    const htmlToDocx = htmlToDocxModule.default ?? htmlToDocxModule;

    const fullHtml = `
        <!DOCTYPE html>
        <html>
            <head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title></head>
            <body>
                <h1>${escapeHtml(doc.title)}</h1>
                ${doc.subtitle ? `<p><em>${escapeHtml(doc.subtitle)}</em></p>` : ""}
                <p><strong>Effective date:</strong> ${escapeHtml(formatDate(doc.effective_date))}</p>
                <hr/>
                ${doc.content}
            </body>
        </html>
    `;

    const buffer: Buffer = await htmlToDocx(fullHtml, null, {
        table: { row: { cantSplit: true } },
        footer: false,
        pageNumber: false,
    });

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

function escapeHtml(input: string) {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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
