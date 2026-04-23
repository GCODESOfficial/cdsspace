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

/** Admin list of bank-change requests (pending by default). */
export async function GET(req: NextRequest) {
    const { deny } = await guard(req);
    if (deny) return deny;
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "pending";

    const sb = getSupabaseAdmin() as any;
    let query = sb
        .from("team_bank_change_requests")
        .select(
            "*, team_members:team_member_id (id, full_name, email, role_title, department, bank_name, bank_code, account_number, account_name, avatar_url)",
        )
        .order("created_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ requests: data ?? [] });
}
