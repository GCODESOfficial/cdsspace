import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAdmin } from "@/lib/finance/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = requireFinanceAdmin(req);
    if (denied) return denied;
    const { id } = await params;
    const sb = getSupabaseAdmin() as any;
    const { data, error } = await sb
        .from("brand_briefs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ brief: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = requireFinanceAdmin(req);
    if (denied) return denied;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const allowed = [
        "invite_label",
        "invite_note",
        "status",
        // Admin-side editing of client-submitted fields.
        "brand_name",
        "brand_tagline",
        "industry",
        "brand_description",
        "contact_name",
        "contact_email",
        "contact_phone",
        "target_audience",
        "competitors",
        "unique_selling_point",
        "brand_personality",
        "brand_values",
        "design_preferences",
        "inspiration_references",
        "assets_needed",
        "goals",
        "long_term_vision",
        "budget_range",
        "timeline",
        "additional_notes",
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) patch[k] = body[k];

    const sb = getSupabaseAdmin() as any;
    const { data, error } = await sb
        .from("brand_briefs")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ brief: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = requireFinanceAdmin(req);
    if (denied) return denied;
    const { id } = await params;
    const sb = getSupabaseAdmin() as any;
    const { error } = await sb.from("brand_briefs").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
