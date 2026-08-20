import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";
import { notifyTeamMember, notifyMany } from "@/lib/notify-team";
import { syncProjectChannelMembers } from "@/lib/team-chat-channels";

/**
 * Project assignments - who can see this project in the team portal.
 *
 *   GET    list assignments (joined with member + department info)
 *   POST   { team_member_id? | department?, role?, is_project_leader? }
 *   DELETE handled in ./[assignmentId]/route.ts
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req);
    if (denied) return denied;
    const { id } = await params;
    const sb = financeDb();
    const { data, error } = await sb
        .from("project_assignments")
        .select(
            "id, project_id, team_member_id, department, role, is_project_leader, can_edit_project, can_manage_tasks, created_at, team_members:team_member_id (id, full_name, email, role_title, department, avatar_url, is_active)",
        )
        .eq("project_id", id)
        .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const seen = new Set<string>();
    const assignments = (data ?? []).filter((assignment: {
        project_id?: string | null;
        team_member_id?: string | null;
        department?: string | null;
    }) => {
        const key = [
            assignment.project_id || id,
            assignment.team_member_id || "",
            (assignment.department || "").toLowerCase(),
        ].join(":");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return NextResponse.json({ assignments });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req);
    if (denied) return denied;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const assignmentId = String(body?.assignment_id || "");
    if (!assignmentId) return NextResponse.json({ error: "Choose a project assignment." }, { status: 400 });

    const sb = financeDb();
    const { data: assignment } = await sb
        .from("project_assignments")
        .select("id,team_member_id,role")
        .eq("id", assignmentId)
        .eq("project_id", id)
        .maybeSingle();
    if (!assignment?.team_member_id) {
        return NextResponse.json({ error: "Only an individually assigned team member can become a project leader." }, { status: 400 });
    }

    const { data, error } = await sb
        .from("project_assignments")
        .update({
            is_project_leader: true,
            can_edit_project: true,
            can_manage_tasks: true,
            role: assignment.role || "Project Leader",
        })
        .eq("id", assignmentId)
        .eq("project_id", id)
        .select("id, project_id, team_member_id, department, role, is_project_leader, can_edit_project, can_manage_tasks, created_at, team_members:team_member_id (id, full_name, email, role_title, department, avatar_url, is_active)")
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: project } = await sb.from("finance_projects").select("name").eq("id", id).maybeSingle();
    await notifyTeamMember({
        recipient_id: assignment.team_member_id,
        kind: "project_leader_assigned",
        title: `You are leading: ${project?.name || "Project"}`,
        body: "You can now edit this project, add tasks and manage milestones.",
        link: `/team/work?project=${id}`,
        actor_is_admin: true,
    });
    await logActivity({
        action: "project.assign_leader",
        page: "finance/projects",
        resource_type: "project",
        resource_id: id,
        resource_label: project?.name || id,
        metadata: { assignment_id: assignmentId, team_member_id: assignment.team_member_id },
    });
    return NextResponse.json({ assignment: data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req);
    if (denied) return denied;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const team_member_id = body?.team_member_id || null;
    const department = body?.department?.toString().trim() || null;
    const role = body?.role?.toString().trim() || null;
    const is_project_leader = body?.is_project_leader === true;

    if (!team_member_id && !department) {
        return NextResponse.json({ error: "Provide a team member or a department." }, { status: 400 });
    }
    if (team_member_id && department) {
        return NextResponse.json({ error: "Pick either a team member or a department, not both." }, { status: 400 });
    }
    if (is_project_leader && !team_member_id) {
        return NextResponse.json({ error: "Project leaders must be assigned to an individual team member." }, { status: 400 });
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
        .insert({
            project_id: id,
            team_member_id,
            department,
            role: role || (is_project_leader ? "Project Leader" : null),
            is_project_leader,
            can_edit_project: is_project_leader,
            can_manage_tasks: is_project_leader,
        })
        .select(
            "id, team_member_id, department, role, is_project_leader, can_edit_project, can_manage_tasks, created_at, team_members:team_member_id (id, full_name, email, role_title, department, avatar_url, is_active)",
        )
        .single();
    if (error) {
        // Unique-index violation (double click / concurrent assign) → treat as
        // the friendly duplicate case instead of surfacing a raw SQL error.
        if (error.code === "23505" || /duplicate key/i.test(error.message)) {
            return NextResponse.json({ error: "That assignment already exists." }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

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
        metadata: { team_member_id, department, role, is_project_leader },
    });

    // Notify the assignee(s). For a specific member, one notification.
    // For a department assignment, notify every active member of that dept.
    if (team_member_id) {
        await notifyTeamMember({
            recipient_id: team_member_id,
            kind: "project_assigned",
            title: `Added to project: ${projectName}`,
            body: is_project_leader ? "You are a project leader and can edit the project and manage its tasks." : role ? `Your role: ${role}` : "Check the project details in the team portal.",
            link: `/team/work`,
            actor_is_admin: true,
        });
    } else if (department) {
        // Members belong to departments both via the legacy single
        // `team_members.department` field and the many-to-many
        // `team_member_departments` junction - notify the union of both.
        let deptMembers: { id: string }[] = [];
        try {
            deptMembers = await glashQuery<{ id: string }>(
                `select distinct m.id
                   from public.team_members m
                  where m.is_active
                    and (
                      lower(m.department) = lower($1)
                      or exists (
                        select 1 from public.team_member_departments tmd
                        join public.departments d on d.id = tmd.department_id
                       where tmd.team_member_id = m.id and lower(d.name) = lower($1)
                      )
                    )`,
                [department],
            );
        } catch {
            const { data } = await sb
                .from("team_members")
                .select("id")
                .ilike("department", department)
                .eq("is_active", true);
            deptMembers = (data || []) as { id: string }[];
        }
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

    // Keep the project chat room's membership in sync with assignments.
    await syncProjectChannelMembers(id).catch(() => {});

    return NextResponse.json({ assignment: data });
}
