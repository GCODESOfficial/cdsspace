import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { deletePricingList, getPricingListById, savePricingList } from "@/lib/pricing/server";
import type { PricingListData } from "@/lib/pricing/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req, "finance");
    if (denied) return denied;
    const { id } = await params;
    const list = await getPricingListById(id);
    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ list });
}

/** Save an edited pricelist (full body) or patch just `published`. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req, "finance");
    if (denied) return denied;
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as Partial<PricingListData> | null;
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    try {
        // Full-document save when packages are present; otherwise a light patch
        // (e.g. publish toggle) applied over the current row.
        let toSave: PricingListData;
        if (Array.isArray(body.packages) && body.title) {
            toSave = { ...(body as PricingListData), id };
        } else {
            const current = await getPricingListById(id);
            if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
            toSave = { ...current, ...body, id };
        }
        const saved = await savePricingList(toSave);
        return NextResponse.json({ list: saved });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to save" },
            { status: 500 },
        );
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req, "finance");
    if (denied) return denied;
    const { id } = await params;
    try {
        await deletePricingList(id);
        return NextResponse.json({ ok: true });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to delete" },
            { status: 500 },
        );
    }
}
