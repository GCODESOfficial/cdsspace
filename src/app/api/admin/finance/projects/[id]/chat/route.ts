import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";

/**
 * Project chat.
 *   GET  → returns the existing thread for this project (if any).
 *   POST → creates a group thread tagged with `project_id`, seeded with every
 *          assigned team member + every member of every assigned department.
 */

async function resolveParticipants(sb: any, projectId: string): Promise<string[]> {
    const { data: assignments } = await sb
        .from("project_assignments")
        .select("team_member_id, department")
        .eq("project_id", projectId);

    const ids = new Set<string>();
    const depts: string[] = [];
    for (const a of (assignments ?? []) as any[]) {
        if (a.team_member_id) ids.add(a.team_member_id);
        if (a.department) depts.push(a.department);
    }
    if (depts.length) {
        const { data: deptMembers } = await sb
            .from("team_members")
            .select("id, department, is_active")
            .in("department", depts)
            .eq("is_active", true);
        for (const m of (deptMembers ?? []) as any[]) ids.add(m.id);
    }
    return Array.from(ids);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req);
    if (denied) return denied;
    const { id } = await params;
    const sb = financeDb();
    const { data } = await sb
        .from("team_chat_threads")
        .select("id, name, kind, created_at")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    return NextResponse.json({ thread: data ?? null });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req);
    if (denied) return denied;
    const { id } = await params;
    const sb = financeDb();

    // Reuse the existing thread if one already exists for this project.
    const { data: existing } = await sb
        .from("team_chat_threads")
        .select("id, name, kind")
        .eq("project_id", id)
        .maybeSingle();
    if (existing) return NextResponse.json({ thread: existing, reused: true });

    const { data: project } = await sb
        .from("finance_projects")
        .select("name")
        .eq("id", id)
        .maybeSingle();
    const projectName = project?.name ?? "Project";

    const { data: thread, error } = await sb
        .from("team_chat_threads")
        .insert({
            kind: "group",
            name: `${projectName} - Project Chat`,
            project_id: id,
            includes_admin: true,
        })
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const participantIds = await resolveParticipants(sb, id);
    if (participantIds.length) {
        await sb
            .from("team_chat_participants")
            .insert(participantIds.map((mid) => ({ thread_id: thread.id, team_member_id: mid })));
    }

    return NextResponse.json({ thread, participant_count: participantIds.length });
}
