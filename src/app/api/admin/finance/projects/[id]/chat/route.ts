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

async function resolveProjectClient(sb: any, projectId: string) {
    const { data: project } = await sb
        .from("finance_projects")
        .select("id, name, client, client_email, user_id")
        .eq("id", projectId)
        .maybeSingle();
    if (!project) return { project: null, client: null };

    let userId = project.user_id as string | null;
    if (!userId && project.client_email) {
        const { data: profile } = await sb
            .from("profiles")
            .select("id")
            .eq("email", project.client_email)
            .maybeSingle();
        userId = profile?.id || null;
    }
    if (!userId) return { project, client: null };

    const { data: profile } = await sb
        .from("profiles")
        .select("id, full_name, company_name, email, avatar_url")
        .eq("id", userId)
        .maybeSingle();
    return {
        project,
        client: profile ? {
            id: profile.id,
            name: profile.full_name || profile.company_name || project.client || profile.email,
            email: profile.email,
            avatar_url: profile.avatar_url || null,
        } : null,
    };
}

async function findProjectThread(sb: any, projectId: string) {
    const { data } = await sb
        .from("team_chat_threads")
        .select("id, name, kind, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    return data || null;
}

async function ensureProjectThread(sb: any, projectId: string, projectName?: string | null) {
    const existing = await findProjectThread(sb, projectId);
    if (existing) return { thread: existing, reused: true };

    const { data: thread, error } = await sb
        .from("team_chat_threads")
        .insert({
            kind: "group",
            name: `${projectName || "Project"} - Project Chat`,
            project_id: projectId,
            includes_admin: true,
        })
        .select()
        .single();
    if (error) throw new Error(error.message);

    const participantIds = await resolveParticipants(sb, projectId);
    if (participantIds.length) {
        await sb
            .from("team_chat_participants")
            .insert(participantIds.map((mid) => ({ thread_id: thread.id, team_member_id: mid })));
    }
    return { thread, reused: false, participant_count: participantIds.length };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req);
    if (denied) return denied;
    const { id } = await params;
    const sb = financeDb();
    const [thread, projectClient] = await Promise.all([
        findProjectThread(sb, id),
        resolveProjectClient(sb, id),
    ]);
    let clientAccess = false;
    let clientParticipants: Array<{ id: string; name: string; email: string | null; avatar_url: string | null }> = [];
    if (thread && projectClient.client) {
        const { data: access } = await sb
            .from("team_chat_client_participants")
            .select("thread_id")
            .eq("thread_id", thread.id)
            .eq("client_user_id", projectClient.client.id)
            .maybeSingle();
        clientAccess = !!access;
    }
    if (thread) {
        const { data: participantRows } = await sb
            .from("team_chat_client_participants")
            .select("client_user_id")
            .eq("thread_id", thread.id);
        const ids = (participantRows ?? []).map((row: any) => row.client_user_id).filter(Boolean);
        if (ids.length) {
            const { data: profiles } = await sb
                .from("profiles")
                .select("id, full_name, company_name, email, avatar_url")
                .in("id", ids);
            clientParticipants = (profiles ?? []).map((profile: any) => ({
                id: profile.id,
                name: profile.full_name || profile.company_name || profile.email || "Client",
                email: profile.email || null,
                avatar_url: profile.avatar_url || null,
            }));
        }
    }
    return NextResponse.json({
        thread,
        client: projectClient.client,
        client_access: clientAccess,
        clients: clientParticipants,
    });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req);
    if (denied) return denied;
    const { id } = await params;
    const sb = financeDb();

    try {
        const { project } = await resolveProjectClient(sb, id);
        if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
        const result = await ensureProjectThread(sb, id, project.name);
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create project chat" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req);
    if (denied) return denied;
    const { id } = await params;
    const payload = await req.json().catch(() => ({}));
    const enabled = payload.enabled;
    const requestedClientIds = Array.isArray(payload.clientIds)
        ? Array.from(new Set(payload.clientIds.map(String).filter((id: string) => /^[0-9a-f-]{36}$/i.test(id))))
        : null;
    if (!requestedClientIds && typeof enabled !== "boolean") {
        return NextResponse.json({ error: "Choose one or more clients." }, { status: 400 });
    }

    const sb = financeDb();
    const { project, client } = await resolveProjectClient(sb, id);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!client && !requestedClientIds) {
        return NextResponse.json(
            { error: "This project is not linked to a registered client account." },
            { status: 409 },
        );
    }

    try {
        const { thread } = await ensureProjectThread(sb, id, project.name);
        if (requestedClientIds) {
            let validClientIds: string[] = [];
            if (requestedClientIds.length) {
                const { data: validProfiles, error: profileError } = await sb
                    .from("profiles")
                    .select("id")
                    .in("id", requestedClientIds);
                if (profileError) throw new Error(profileError.message);
                validClientIds = (validProfiles ?? []).map((profile: any) => profile.id);
                if (validClientIds.length !== requestedClientIds.length) {
                    return NextResponse.json({ error: "One or more selected clients no longer exist." }, { status: 400 });
                }
            }
            const { error: removeError } = await sb
                .from("team_chat_client_participants")
                .delete()
                .eq("thread_id", thread.id);
            if (removeError) throw new Error(removeError.message);
            if (validClientIds.length) {
                const { error: insertError } = await sb.from("team_chat_client_participants").insert(
                    validClientIds.map((clientId) => ({ thread_id: thread.id, client_user_id: clientId, added_by: "admin" })),
                );
                if (insertError) throw new Error(insertError.message);
            }
            return NextResponse.json({ thread, client_ids: validClientIds, client_access: client ? validClientIds.includes(client.id) : false });
        }
        if (!client) {
            return NextResponse.json(
                { error: "This project is not linked to a registered client account." },
                { status: 409 },
            );
        }
        if (enabled) {
            const { error } = await sb.from("team_chat_client_participants").upsert({
                thread_id: thread.id,
                client_user_id: client.id,
                added_by: "admin",
            });
            if (error) throw new Error(error.message);
        } else {
            const { error } = await sb
                .from("team_chat_client_participants")
                .delete()
                .eq("thread_id", thread.id)
                .eq("client_user_id", client.id);
            if (error) throw new Error(error.message);
        }
        return NextResponse.json({ thread, client, client_access: enabled });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update client access" }, { status: 500 });
    }
}
