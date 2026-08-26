import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function isUuid(value: unknown) {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req, "brand_briefs");
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
    const denied = await requireFinanceAdminAsync(req, "brand_briefs");
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
        "budget_currency",
        "timeline",
        "additional_notes",
        "client_user_id",
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) patch[k] = body[k];

    if ("client_user_id" in patch) {
        const clientUserId = patch.client_user_id;
        if (clientUserId !== null && !isUuid(clientUserId)) {
            return NextResponse.json({ error: "Select a valid client account." }, { status: 400 });
        }
    }

    const sb = getSupabaseAdmin() as any;
    const { data, error } = await sb
        .from("brand_briefs")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if ("client_user_id" in patch) {
        await logActivity({
            action: patch.client_user_id ? "brand_brief.client.attach" : "brand_brief.client.detach",
            page: "brand-briefs",
            resource_type: "brand_brief",
            resource_id: id,
            resource_label: data.brand_name || data.invite_label || "Brand brief",
            metadata: { client_user_id: patch.client_user_id || null },
        });
    }
    return NextResponse.json({ brief: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req, "brand_briefs");
    if (denied) return denied;
    const { id } = await params;
    const sb = getSupabaseAdmin() as any;
    const { error } = await sb.from("brand_briefs").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
