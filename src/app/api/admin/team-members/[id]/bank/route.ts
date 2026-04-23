import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { getSupabaseAdmin } from "@/lib/supabase";

async function guard(req: NextRequest) {
    const s = await getAdminSessionAsync(req);
    if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (s.role === "super_admin") return null;
    if (hasPermission(s.permissions, "team_payroll") || hasPermission(s.permissions, "team_members.edit")) {
        return null;
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** Admin writes bank / salary fields directly on a team member. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await guard(req);
    if (denied) return denied;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const allowed = [
        "bank_name",
        "bank_code",
        "account_number",
        "account_name",
        "base_salary",
        "salary_currency",
        "pay_cycle",
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) patch[k] = body[k];

    if (!Object.keys(patch).length) {
        return NextResponse.json({ error: "No bank/salary fields provided." }, { status: 400 });
    }

    const sb = getSupabaseAdmin() as any;
    const { data, error } = await sb
        .from("team_members")
        .update(patch)
        .eq("id", id)
        .select(
            "id, full_name, email, role_title, department, bank_name, bank_code, account_number, account_name, base_salary, salary_currency, pay_cycle, avatar_url, is_active",
        )
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ member: data });
}
