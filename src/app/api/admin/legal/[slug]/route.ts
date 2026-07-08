import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { isLegalSlug } from "@/lib/legal/default-content";
import { loadLegalDocument, upsertLegalDocument } from "@/lib/legal/server";

async function requireLegalAccess(req: NextRequest, mode: "view" | "edit") {
    const session = await getAdminSessionAsync(req);
    if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

    const key = mode === "edit" ? "legal.edit" : "legal";
    if (session.role !== "super_admin" && !hasPermission(session.permissions, key)) {
        return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { session };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    if (!isLegalSlug(slug)) return NextResponse.json({ error: "Unknown document" }, { status: 404 });

    const auth = await requireLegalAccess(req, "view");
    if (auth.error) return auth.error;

    const doc = await loadLegalDocument(slug);
    return NextResponse.json({ document: doc });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    if (!isLegalSlug(slug)) return NextResponse.json({ error: "Unknown document" }, { status: 404 });

    const auth = await requireLegalAccess(req, "edit");
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body || typeof body.title !== "string" || typeof body.content !== "string") {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const effectiveDate: string =
        typeof body.effective_date === "string" && body.effective_date.length > 0
            ? body.effective_date
            : new Date().toISOString().slice(0, 10);

    try {
        const doc = await upsertLegalDocument({
            slug,
            title: body.title,
            subtitle: typeof body.subtitle === "string" ? body.subtitle : null,
            content: body.content,
            effectiveDate,
            updatedBy: auth.session!.email,
        });
        return NextResponse.json({ document: doc });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to save";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
