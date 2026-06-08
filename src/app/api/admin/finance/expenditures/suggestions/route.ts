import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";

/**
 * Typeahead suggestions for the expenditure form. Two tables:
 *   - finance_expenditure_titles
 *   - finance_expenditure_categories
 *
 *   GET  /api/admin/finance/expenditures/suggestions?field=title|category&q=...
 *     → returns up to 20 matches, ranked by usage_count desc then name asc.
 *
 *   POST /api/admin/finance/expenditures/suggestions
 *     Body: { field: "title" | "category", name: string }
 *     → upserts the name and increments its usage_count. Called whenever a
 *       new value is submitted through the expenditure form.
 */

function tableFor(field: string): string | null {
    if (field === "title") return "finance_expenditure_titles";
    if (field === "category") return "finance_expenditure_categories";
    return null;
}

export async function GET(req: NextRequest) {
    const denied = await requireFinanceAdminAsync(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const field = (url.searchParams.get("field") || "").toLowerCase();
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || 20), 50);

    const table = tableFor(field);
    if (!table) return NextResponse.json({ error: "Invalid field" }, { status: 400 });

    const sb = financeDb();
    let query = sb
        .from(table)
        .select("id, name, usage_count")
        .order("usage_count", { ascending: false })
        .order("name", { ascending: true })
        .limit(limit);

    if (q) query = query.ilike("name", `%${q}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ suggestions: data ?? [] });
}

export async function POST(req: NextRequest) {
    const denied = await requireFinanceAdminAsync(req);
    if (denied) return denied;

    const body = await req.json().catch(() => ({}));
    const field = (body?.field || "").toLowerCase();
    const raw = (body?.name || "").toString().trim();
    const table = tableFor(field);
    if (!table) return NextResponse.json({ error: "Invalid field" }, { status: 400 });
    if (!raw) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const sb = financeDb();
    // Fast path: look up existing (case-insensitive) and bump the count.
    const { data: existing } = await sb
        .from(table)
        .select("id, name, usage_count")
        .ilike("name", raw)
        .limit(1)
        .maybeSingle();

    if (existing) {
        const { data, error } = await sb
            .from(table)
            .update({ usage_count: (existing.usage_count ?? 0) + 1, last_used_at: new Date().toISOString() })
            .eq("id", existing.id)
            .select()
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ suggestion: data });
    }

    const { data, error } = await sb
        .from(table)
        .insert({ name: raw, usage_count: 1 })
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ suggestion: data });
}
