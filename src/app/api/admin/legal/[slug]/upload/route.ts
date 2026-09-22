import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { isLegalSlug } from "@/lib/legal/default-content";
import { loadLegalDocument, upsertLegalDocument } from "@/lib/legal/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB hard cap

/**
 * Accepts a .docx upload, converts it to HTML with `mammoth`, and saves the
 * result as the new document content.
 *
 * The admin editor never sees the .docx - only the HTML mammoth produces.
 * If the user wants finer formatting they can edit the HTML directly in the
 * textarea and save.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const session = await getAdminSessionAsync(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== "super_admin" && !hasPermission(session.permissions, "legal.edit")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { slug } = await params;
    if (!isLegalSlug(slug)) return NextResponse.json({ error: "Unknown document" }, { status: 404 });

    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid multipart form" }, { status: 400 });

    const file = form.get("file");
    if (!(file instanceof Blob)) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.size === 0) {
        return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
        return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
    }

    const filename = (file as File).name?.toLowerCase() ?? "";
    if (!filename.endsWith(".docx")) {
        return NextResponse.json(
            { error: "Only .docx files are supported. Export from Word or Google Docs." },
            { status: 400 }
        );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // mammoth is pure JS and runs on the Node runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mammoth: any = await import("mammoth");

    let html: string;
    try {
        const result = await mammoth.convertToHtml(
            { buffer },
            {
                styleMap: [
                    "p[style-name='Heading 1'] => h1",
                    "p[style-name='Heading 2'] => h2",
                    "p[style-name='Heading 3'] => h3",
                    "p[style-name='Quote'] => blockquote",
                    "r[style-name='Strong'] => strong",
                ],
            }
        );
        html = result.value ?? "";
    } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to parse .docx";
        return NextResponse.json({ error: message }, { status: 400 });
    }

    if (!html.trim()) {
        return NextResponse.json({ error: "Document appeared to be empty after parsing" }, { status: 400 });
    }

    // Pull the first H1 as title when present; strip it from the body so it
    // doesn't duplicate the page title. Keep everything else as-is.
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const importedTitle = titleMatch?.[1] ? String(titleMatch[1]).replace(/<[^>]+>/g, "").trim() : "";
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, "");

    const current = await loadLegalDocument(slug);

    const doc = await upsertLegalDocument({
        slug,
        title: importedTitle || current.title,
        subtitle: current.subtitle,
        content: html,
        effectiveDate: new Date().toISOString().slice(0, 10),
        updatedBy: session.email,
    });

    return NextResponse.json({ document: doc });
}
