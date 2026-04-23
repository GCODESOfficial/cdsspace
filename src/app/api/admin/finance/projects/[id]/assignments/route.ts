import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

/**
 * Project assignments — who can see this project in the team portal.
 *
 *   GET    list assignments (joined with member + department info)
 *   POST   { team_member_id? | department?, role? }
 *   DELETE handled in ./[assignmentId]/route.ts
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = requireFinanceAdmin(req);
    if (denied) return denied;
    const { id } = await params;
    const sb = financeDb();
    const { data, error } = await sb
        .from("project_assignments")
        .select(
            "id, team_member_id, department, role, created_at, team_members:team_member_id (id, full_name, email, role_title, department, avatar_url, is_active)",
        )
        .eq("project_id", id)
        .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ assignments: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = requireFinanceAdmin(req);
    if (denied) return denied;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const team_member_id = body?.team_member_id || null;
    const department = body?.department?.toString().trim() || null;
    const role = body?.role?.toString().trim() || null;

    if (!team_member_id && !department) {
        return NextResponse.json({ error: "Provide a team member or a department." }, { status: 400 });
    }
    if (team_member_id && department) {
        return NextResponse.json({ error: "Pick either a team member or a department, not both." }, { status: 400 });
    }

    const sb = financeDb();
    // Prevent duplicate assignment of the same target to the same project.
    const dupQuery = team_member_id
        ? sb.from("project_assignments").select("id").eq("project_id", id).eq("team_member_id", team_member_id).maybeSingle()
        : sb.from("project_assignments").select("id").eq("project_id", id).ilike("department", department!).maybeSingle();
    const { data: dup } = await dupQuery;
    if (dup) return NextResponse.json({ error: "That assignment already exists." }, { status: 409 });

    const { data, error } = await sb
        .from("project_assignments")
        .insert({ project_id: id, team_member_id, department, role })
        .select(
            "id, team_member_id, department, role, created_at, team_members:team_member_id (id, full_name, email, role_title, department, avatar_url, is_active)",
        )
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ assignment: data });
}
