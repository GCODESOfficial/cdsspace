import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { getSupabaseAdmin } from "@/lib/supabase";

async function guard(req: NextRequest) {
    const s = await getAdminSessionAsync(req);
    if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (s.role === "super_admin") return null;
    if (hasPermission(s.permissions, "team_payroll")) return null;
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await guard(req);
    if (denied) return denied;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const allowed = [
        "period",
        "period_type",
        "gross_amount",
        "deductions",
        "currency",
        "status",
        "payment_ref",
        "paid_on",
        "scheduled_for",
        "notes",
        "bank_name",
        "bank_code",
        "account_number",
        "account_name",
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) patch[k] = body[k];

    if ("gross_amount" in patch || "deductions" in patch) {
        const sb = getSupabaseAdmin() as any;
        const { data: existing } = await sb
            .from("team_payroll_entries")
            .select("gross_amount, deductions")
            .eq("id", id)
            .maybeSingle();
        const g = Number(patch.gross_amount ?? existing?.gross_amount ?? 0);
        const d = Number(patch.deductions ?? existing?.deductions ?? 0);
        patch.net_amount = Math.max(0, g - d);
    }

    if (patch.status === "paid" && !patch.paid_on) {
        patch.paid_on = new Date().toISOString().slice(0, 10);
    }

    const sb = getSupabaseAdmin() as any;
    const { data, error } = await sb
        .from("team_payroll_entries")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await guard(req);
    if (denied) return denied;
    const { id } = await params;
    const sb = getSupabaseAdmin() as any;
    const { error } = await sb.from("team_payroll_entries").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
