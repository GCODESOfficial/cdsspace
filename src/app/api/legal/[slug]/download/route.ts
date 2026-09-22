import { NextResponse } from "next/server";
import { isLegalSlug } from "@/lib/legal/default-content";
import { buildLegalPdf, legalPdfFileName } from "@/lib/legal/pdf";
import { loadLegalDocument } from "@/lib/legal/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public legal documents are already published, so visitors may keep the same version as a PDF. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    if (!isLegalSlug(slug)) {
        return NextResponse.json({ error: "Unknown document" }, { status: 404 });
    }

    const document = await loadLegalDocument(slug);
    const pdf = buildLegalPdf(document);
    return new NextResponse(new Uint8Array(pdf), {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${legalPdfFileName(document)}"`,
            "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
    });
}
