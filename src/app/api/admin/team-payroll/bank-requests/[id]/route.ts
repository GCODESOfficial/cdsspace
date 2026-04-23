import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { getSupabaseAdmin } from "@/lib/supabase";

async function guard(req: NextRequest) {
    const s = await getAdminSessionAsync(req);
    if (!s) return { deny: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), s: null };
    if (s.role === "super_admin" || hasPermission(s.permissions, "team_payroll")) return { deny: null, s };
    return { deny: NextResponse.json({ error: "Forbidden" }, { status: 403 }), s: null };
}

/**
 * PATCH a bank-change request.
 *   { action: "approve", admin_note?: string }  → applies to team_members + marks approved
 *   { action: "reject",  admin_note?: string }  → marks rejected
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { deny, s } = await guard(req);
    if (deny) return deny;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = (body?.action || "").toLowerCase();
    const admin_note = body?.admin_note ? String(body.admin_note).trim() : null;

    const sb = getSupabaseAdmin() as any;
    const { data: reqRow } = await sb
        .from("team_bank_change_requests")
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (!reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (reqRow.status !== "pending") {
        return NextResponse.json({ error: `Already ${reqRow.status}.` }, { status: 409 });
    }

    const reviewer = s?.name ?? s?.email ?? "admin";

    if (action === "approve") {
        await sb
            .from("team_members")
            .update({
                bank_name: reqRow.bank_name ?? null,
                bank_code: reqRow.bank_code ?? null,
                account_number: reqRow.account_number ?? null,
                account_name: reqRow.account_name ?? null,
            })
            .eq("id", reqRow.team_member_id);
    } else if (action !== "reject") {
        return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }

    const { data, error } = await sb
        .from("team_bank_change_requests")
        .update({
            status: action === "approve" ? "approved" : "rejected",
            admin_note,
            reviewed_by: reviewer,
            reviewed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ request: data });
}
