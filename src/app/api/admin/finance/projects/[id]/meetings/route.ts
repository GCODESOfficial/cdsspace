import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";

/**
 * Project meetings.
 *   GET  → list scheduled / live meetings for this project.
 *   POST → create an immediate (start=now, status=live) or scheduled meeting
 *          seeded with every assigned team member (direct + by department).
 *
 * Body: { title: string, agenda?: string, scheduled_for?: ISO string }
 *       - pass `scheduled_for` for scheduled; omit for immediate.
 */

function generateRoomCode() {
    const alpha = "ABCDEFGHJKMNPQRSTUVWXYZ";
    const num = "23456789";
    const pick = (s: string) => s.charAt(Math.floor(Math.random() * s.length));
    return `CDS-${pick(alpha)}${pick(alpha)}${pick(num)}${pick(num)}${pick(alpha)}${pick(num)}`;
}

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
            .select("id")
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
        .from("team_meetings")
        .select("id, room_code, title, agenda, scheduled_for, status, started_at, ended_at, created_at")
        .eq("project_id", id)
        .in("status", ["scheduled", "live"])
        .order("scheduled_for", { ascending: true, nullsFirst: false });
    return NextResponse.json({ meetings: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req);
    if (denied) return denied;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const title = body?.title?.toString().trim();
    const agenda = body?.agenda?.toString().trim() || null;
    const scheduledFor: string | null = body?.scheduled_for
        ? new Date(body.scheduled_for).toISOString()
        : null;

    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

    const immediate = !scheduledFor;
    const sb = financeDb();
    const { data: meeting, error } = await sb
        .from("team_meetings")
        .insert({
            room_code: generateRoomCode(),
            title,
            agenda,
            scheduled_for: scheduledFor,
            status: immediate ? "live" : "scheduled",
            started_at: immediate ? new Date().toISOString() : null,
            created_by_admin: true,
            project_id: id,
        })
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const participantIds = await resolveParticipants(sb, id);
    if (participantIds.length) {
        await sb
            .from("team_meeting_participants")
            .insert(participantIds.map((mid) => ({ meeting_id: meeting.id, team_member_id: mid })));
    }

    return NextResponse.json({ meeting, participant_count: participantIds.length });
}
