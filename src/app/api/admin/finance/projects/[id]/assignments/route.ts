import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";
import { logActivity } from "@/lib/activity-log";
import { notifyTeamMember, notifyMany } from "@/lib/notify-team";

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

    // Grab project name up-front so both the log row and notifications can
    // carry a readable label without another round-trip.
    const { data: projectMeta } = await sb
        .from("finance_projects")
        .select("id, name")
        .eq("id", id)
        .maybeSingle();
    const projectName = projectMeta?.name || `Project ${id.slice(0, 8)}`;

    const { data, error } = await sb
        .from("project_assignments")
        .insert({ project_id: id, team_member_id, department, role })
        .select(
            "id, team_member_id, department, role, created_at, team_members:team_member_id (id, full_name, email, role_title, department, avatar_url, is_active)",
        )
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const assignedMember = Array.isArray(data?.team_members)
        ? (data.team_members as unknown[])[0] as { full_name?: string; email?: string } | undefined
        : (data?.team_members as { full_name?: string; email?: string } | null);
    const targetLabel = team_member_id
        ? assignedMember?.full_name || assignedMember?.email || "Team member"
        : `Department: ${department}`;

    await logActivity({
        action: "project.assign",
        page: "finance/projects",
        resource_type: "project",
        resource_id: id,
        resource_label: `${projectName} → ${targetLabel}${role ? ` (${role})` : ""}`,
        metadata: { team_member_id, department, role },
    });

    // Notify the assignee(s). For a specific member, one notification.
    // For a department assignment, notify every active member of that dept.
    if (team_member_id) {
        await notifyTeamMember({
            recipient_id: team_member_id,
            kind: "project_assigned",
            title: `Added to project: ${projectName}`,
            body: role ? `Your role: ${role}` : "Check the project details in the team portal.",
            link: `/team/work`,
            actor_is_admin: true,
        });
    } else if (department) {
        const { data: deptMembers } = await sb
            .from("team_members")
            .select("id")
            .eq("department", department)
            .eq("is_active", true);
        const rows = (deptMembers || []).map((m: { id: string }) => ({
            recipient_id: m.id,
            kind: "project_assigned",
            title: `${department} added to project: ${projectName}`,
            body: role ? `Department role: ${role}` : "Check the project details in the team portal.",
            link: "/team/work",
            actor_is_admin: true,
        }));
        if (rows.length) await notifyMany(rows);
    }

    return NextResponse.json({ assignment: data });
}
