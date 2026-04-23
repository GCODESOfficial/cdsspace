import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { getSupabaseAdmin } from "@/lib/supabase";

async function guard(req: NextRequest) {
    const s = await getAdminSessionAsync(req);
    if (!s) return { deny: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
    if (s.role === "super_admin") return { deny: null, session: s };
    if (hasPermission(s.permissions, "team_payroll")) return { deny: null, session: s };
    return { deny: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null };
}

/**
 * Admin team-payroll endpoint.
 *
 *   GET   /api/admin/team-payroll               — list entries joined with member bank info
 *   POST  /api/admin/team-payroll               — create one entry
 *   POST  /api/admin/team-payroll  (bulk=true)  — create many (one per active member / department)
 */
export async function GET(req: NextRequest) {
    const { deny } = await guard(req);
    if (deny) return deny;

    const sb = getSupabaseAdmin() as any;
    const { data, error } = await sb
        .from("team_payroll_entries")
        .select(
            "*, team_members:team_member_id (id, full_name, email, role_title, department, bank_name, bank_code, account_number, account_name, base_salary, salary_currency, pay_cycle, is_active, avatar_url)",
        )
        .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data ?? [] });
}

interface NewEntryInput {
    team_member_id: string;
    period: string;
    period_type?: "monthly" | "weekly" | "bi_weekly" | "one_off";
    gross_amount: number | string;
    deductions?: number | string;
    currency?: string;
    scheduled_for?: string | null;
    notes?: string | null;
    status?: "pending" | "approved" | "paid" | "cancelled";
    payment_ref?: string | null;
    paid_on?: string | null;
}

async function buildInsertRow(sb: any, input: NewEntryInput) {
    const gross = Number(input.gross_amount || 0);
    const ded = Number(input.deductions || 0);
    const net = Math.max(0, gross - ded);

    // Snapshot the team member's current bank details onto the entry so the
    // payroll history is accurate even if they later change their account.
    const { data: m } = await sb
        .from("team_members")
        .select("bank_name, bank_code, account_number, account_name, salary_currency, pay_cycle")
        .eq("id", input.team_member_id)
        .maybeSingle();

    return {
        team_member_id: input.team_member_id,
        period: input.period,
        period_type: input.period_type || m?.pay_cycle || "monthly",
        gross_amount: gross,
        deductions: ded,
        net_amount: net,
        currency: input.currency || m?.salary_currency || "NGN",
        scheduled_for: input.scheduled_for || null,
        notes: input.notes || null,
        status: input.status || "pending",
        payment_ref: input.payment_ref || null,
        paid_on: input.paid_on || null,
        bank_name: m?.bank_name ?? null,
        bank_code: m?.bank_code ?? null,
        account_number: m?.account_number ?? null,
        account_name: m?.account_name ?? null,
    };
}

export async function POST(req: NextRequest) {
    const { deny } = await guard(req);
    if (deny) return deny;

    const body = await req.json().catch(() => ({}));
    const sb = getSupabaseAdmin() as any;

    // Bulk path: { bulk: true, department?: string, member_ids?: string[], defaults: NewEntryInput }
    if (body?.bulk) {
        let q = sb
            .from("team_members")
            .select("id, department, is_active, base_salary, salary_currency, pay_cycle")
            .eq("is_active", true);
        if (body.department) q = q.eq("department", body.department);
        const { data: members, error } = await q;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const targetIds: string[] = Array.isArray(body.member_ids) && body.member_ids.length
            ? body.member_ids
            : (members ?? []).map((m: any) => m.id);
        const byId = new Map((members ?? []).map((m: any) => [m.id, m]));

        const rows = await Promise.all(
            targetIds.map(async (id) => {
                const m = byId.get(id);
                const input: NewEntryInput = {
                    team_member_id: id,
                    period: body.defaults?.period,
                    period_type: body.defaults?.period_type || m?.pay_cycle || "monthly",
                    gross_amount: body.defaults?.gross_amount ?? m?.base_salary ?? 0,
                    deductions: body.defaults?.deductions ?? 0,
                    currency: body.defaults?.currency || m?.salary_currency || "NGN",
                    scheduled_for: body.defaults?.scheduled_for ?? null,
                    notes: body.defaults?.notes ?? null,
                    status: body.defaults?.status || "pending",
                };
                return buildInsertRow(sb, input);
            }),
        );
        const { data, error: insErr } = await sb
            .from("team_payroll_entries")
            .insert(rows)
            .select();
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
        return NextResponse.json({ entries: data ?? [] });
    }

    // Single-entry path
    if (!body?.team_member_id || !body?.period || body?.gross_amount == null) {
        return NextResponse.json({ error: "team_member_id, period, gross_amount are required" }, { status: 400 });
    }
    const row = await buildInsertRow(sb, body as NewEntryInput);
    const { data, error } = await sb.from("team_payroll_entries").insert(row).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data });
}
