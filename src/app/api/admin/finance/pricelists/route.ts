import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { listPricingLists, savePricingList } from "@/lib/pricing/server";
import type { PricingListData } from "@/lib/pricing/types";

export const runtime = "nodejs";

/** List all pricelists (admin - includes unpublished). */
export async function GET(req: NextRequest) {
    const denied = await requireFinanceAdminAsync(req, "finance");
    if (denied) return denied;
    try {
        const lists = await listPricingLists();
        return NextResponse.json({ lists });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to load pricelists" },
            { status: 500 },
        );
    }
}

/** Create or update a pricelist from a reviewed PricingListData body. */
export async function POST(req: NextRequest) {
    const denied = await requireFinanceAdminAsync(req, "finance");
    if (denied) return denied;

    const body = (await req.json().catch(() => null)) as PricingListData | null;
    if (!body || !body.title || !Array.isArray(body.packages)) {
        return NextResponse.json({ error: "title and packages are required" }, { status: 400 });
    }
    try {
        const saved = await savePricingList(body);
        return NextResponse.json({ list: saved });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to save pricelist" },
            { status: 500 },
        );
    }
}
