/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { logActivity } from "@/lib/activity-log";
import { glashMaybeOne, glashOne, glashQuery } from "@/lib/glashdb/postgres";
import {
  attendanceScores,
  isEarlyLogout,
  isWorkDay,
  lagosDate,
  officeRequiredFor,
  overtimeMinutes,
  workMinutes,
  type AttendanceStatus,
  type WorkMode,
} from "@/lib/timebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canManageTimebook(session: { role: string; permissions: string[] }) {
  return session.role === "super_admin"
    || hasPermission(session.permissions, "timebook")
    || hasPermission(session.permissions, "team_members");
}

function normalizeDate(value: string | null, fallback = lagosDate()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value! : fallback;
}

function dateKey(value: unknown, fallback = lagosDate()) {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return fallback;
}

function generateBypassCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "CDS-";
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function bypassCodeHash(code: string) {
  return crypto.createHash("sha256").update(code.trim().toUpperCase().replace(/\s+/g, "")).digest("hex");
}

function eachDate(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00+01:00`);
  const stop = new Date(`${end}T12:00:00+01:00`);
  while (cursor <= stop) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function requireTimebookAdmin() {
  const session = await getAdminSession();
  if (!session) return { session: null, denied: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  if (!canManageTimebook(session)) {
    return { session, denied: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { session, denied: null };
}

export async function GET(req: NextRequest) {
  const { session, denied } = await requireTimebookAdmin();
  if (denied) return denied;

  const url = new URL(req.url);
  const date = normalizeDate(url.searchParams.get("date"));
  const from = normalizeDate(url.searchParams.get("from"), date);
  const to = normalizeDate(url.searchParams.get("to"), from);

  const [members, profiles, entries, leaveRequests, bypassCodes] = await Promise.all([
    glashQuery("select id, full_name, email, role_title, department, is_active from public.team_members where is_active = true order by full_name asc"),
    glashQuery("select * from public.team_time_profiles"),
    glashQuery("select * from public.team_time_entries where work_date >= $1 and work_date <= $2 order by work_date desc", [from, to]),
    glashQuery(
      `select l.*,
        jsonb_build_object('full_name', m.full_name, 'email', m.email, 'role_title', m.role_title, 'department', m.department) as team_members
       from public.team_leave_requests l
       left join public.team_members m on m.id = l.team_member_id
       order by l.created_at desc
       limit 50`,
    ),
    glashQuery("select * from public.team_geofence_bypass_codes order by created_at desc limit 30"),
  ]);

  const profileByMember = new Map<string, any>((profiles ?? []).map((profile: any) => [profile.team_member_id, profile]));
  const leaveForDate = (leaveRequests ?? []).filter((leave: any) =>
    leave.status === "approved" && dateKey(leave.start_date) <= date && dateKey(leave.end_date) >= date,
  );
  const leaveByMember = new Map<string, any>(leaveForDate.map((leave: any) => [leave.team_member_id, leave]));
  const entryByMemberDate = new Map<string, any>((entries ?? []).map((entry: any) => [`${entry.team_member_id}:${dateKey(entry.work_date)}`, entry]));

  const rows = (members ?? []).map((member: any) => {
    const profile = profileByMember.get(member.id) ?? {
      team_member_id: member.id,
      work_mode: "onsite",
      hybrid_office_days: [],
      flexible_break_enabled: false,
    };
    const entry = entryByMemberDate.get(`${member.id}:${date}`) ?? null;
    const leave = leaveByMember.get(member.id) ?? null;
    const workMode = (profile.work_mode || "onsite") as WorkMode;
    const officeRequired = isWorkDay(date) && officeRequiredFor(workMode, profile.hybrid_office_days ?? [], date);
    const computedStatus = entry?.attendance_status
      || (leave ? "approved_leave" : isWorkDay(date) ? "absent" : "approved_leave");
    const flags = Array.from(new Set([
      ...(entry?.flags ?? []),
      ...(officeRequired && !entry && isWorkDay(date) ? ["missed_required_office_day"] : []),
    ]));
    return {
      member,
      profile,
      entry,
      leave,
      office_required: officeRequired,
      attendance_status: computedStatus,
      flags,
    };
  });

  const stats = rows.reduce(
    (acc: Record<string, number>, row: any) => {
      acc.total += 1;
      acc[row.attendance_status] = (acc[row.attendance_status] || 0) + 1;
      if (row.entry?.current_status === "on_break") acc.on_break += 1;
      if (Number(row.entry?.overtime_minutes || 0) > 0) acc.overtime += 1;
      if (row.flags.length > 0) acc.flagged += 1;
      return acc;
    },
    { total: 0, early: 0, on_time: 0, late: 0, half_day: 0, absent: 0, approved_leave: 0, on_break: 0, overtime: 0, flagged: 0 },
  );

  const memberById = new Map<string, any>((members ?? []).map((member: any) => [member.id, member]));
  const hydratedBypassCodes = (bypassCodes ?? []).map((code: any) => ({
    ...code,
    assigned_member: code.assigned_team_member_id
      ? memberById.get(code.assigned_team_member_id) ?? null
      : null,
  }));

  return NextResponse.json({
    ok: true,
    date,
    from,
    to,
    rows,
    entries: entries ?? [],
    leave_requests: leaveRequests ?? [],
    bypass_codes: hydratedBypassCodes,
    stats,
    actor: session?.name,
  });
}

export async function POST(req: NextRequest) {
  const { session, denied } = await requireTimebookAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");

  if (action === "generate_bypass_code") {
    if (session?.role !== "super_admin") {
      return NextResponse.json({ ok: false, error: "Only super admins can generate team bypass codes." }, { status: 403 });
    }
    const code = generateBypassCode();
    const expiresMinutes = Math.max(5, Math.min(5 * 24 * 60, Number(body.expires_minutes || 30)));
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();
    const assignedMemberId = body.member_id || null;
    const data = await glashOne(
      `insert into public.team_geofence_bypass_codes
        (code_hash, code_hint, generated_by, generated_by_name, assigned_team_member_id, reason, expires_at)
       values ($1,$2,$3,$4,$5,$6,$7)
       returning *`,
      [
        bypassCodeHash(code),
        `${code.slice(0, 4)}••${code.slice(-2)}`,
        session?.email ?? null,
        session?.name ?? null,
        assignedMemberId,
        body.reason || "Team login/geofence bypass approved by super admin",
        expiresAt,
      ],
    );
    await logActivity({
      action: "timebook.generate_bypass_code",
      page: "timebook",
      resource_type: "team_geofence_bypass_code",
      resource_id: data.id,
      resource_label: data.code_hint,
      metadata: { assigned_team_member_id: assignedMemberId, expires_at: expiresAt, reason: body.reason || null },
    });
    return NextResponse.json({ ok: true, code, bypass_code: data });
  }

  if (action === "revoke_bypass_code") {
    if (session?.role !== "super_admin") {
      return NextResponse.json({ ok: false, error: "Only super admins can revoke team bypass codes." }, { status: 403 });
    }
    const codeId = body.code_id;
    if (!codeId) return NextResponse.json({ ok: false, error: "code_id is required." }, { status: 400 });
    const data = await glashOne(
      "update public.team_geofence_bypass_codes set status = 'revoked' where id = $1 returning *",
      [codeId],
    );
    await logActivity({
      action: "timebook.revoke_bypass_code",
      page: "timebook",
      resource_type: "team_geofence_bypass_code",
      resource_id: codeId,
      resource_label: data.code_hint,
    });
    return NextResponse.json({ ok: true, bypass_code: data });
  }

  if (action === "update_profile") {
    const memberId = body.member_id;
    const workMode = body.work_mode as WorkMode;
    if (!memberId || !workMode) {
      return NextResponse.json({ ok: false, error: "member_id and work_mode are required." }, { status: 400 });
    }
    const hybridDays = Array.isArray(body.hybrid_office_days)
      ? body.hybrid_office_days.map((day: any) => Number(day)).filter((day: number) => day >= 1 && day <= 5)
      : [];
    const profile = await glashOne(
      `insert into public.team_time_profiles
        (team_member_id, work_mode, hybrid_office_days, flexible_break_enabled, approved_location_note, manager_note, updated_by)
       values ($1,$2,$3::int[],$4,$5,$6,$7)
       on conflict (team_member_id) do update set
         work_mode = excluded.work_mode,
         hybrid_office_days = excluded.hybrid_office_days,
         flexible_break_enabled = excluded.flexible_break_enabled,
         approved_location_note = excluded.approved_location_note,
         manager_note = excluded.manager_note,
         updated_by = excluded.updated_by,
         updated_at = now()
       returning *`,
      [
        memberId,
        workMode,
        hybridDays,
        !!body.flexible_break_enabled,
        body.approved_location_note || null,
        body.manager_note || null,
        session?.email ?? session?.name ?? null,
      ],
    );

    await logActivity({
      action: "timebook.update_profile",
      page: "timebook",
      resource_type: "team_time_profile",
      resource_id: memberId,
      resource_label: workMode,
      metadata: { hybrid_office_days: hybridDays, flexible_break_enabled: !!body.flexible_break_enabled },
    });

    return NextResponse.json({ ok: true, profile });
  }

  if (action === "review_leave") {
    const leaveId = body.leave_id;
    const status = body.status === "approved" ? "approved" : body.status === "rejected" ? "rejected" : null;
    if (!leaveId || !status) {
      return NextResponse.json({ ok: false, error: "leave_id and valid status are required." }, { status: 400 });
    }
    const leave = await glashMaybeOne<any>("select * from public.team_leave_requests where id = $1 limit 1", [leaveId]);
    if (!leave) return NextResponse.json({ ok: false, error: "Leave request not found." }, { status: 404 });

    const data = await glashOne(
      `update public.team_leave_requests
       set status = $1, reviewed_by = $2, reviewed_at = now(), review_note = $3
       where id = $4
       returning *`,
      [status, session?.email ?? session?.name ?? null, body.review_note || null, leaveId],
    );

    if (status === "approved") {
      const days = eachDate(dateKey(leave.start_date), dateKey(leave.end_date)).filter((day) => isWorkDay(day));
      await Promise.all(days.map((day) => glashQuery(
        `insert into public.team_time_entries
          (team_member_id, work_date, work_mode, attendance_status, current_status, office_required, flags, scores, notes)
         values ($1,$2,'approved_leave','approved_leave','offline',false,'{}'::text[],$3::jsonb,$4)
         on conflict (team_member_id, work_date) do update set
           work_mode = excluded.work_mode,
           attendance_status = excluded.attendance_status,
           current_status = excluded.current_status,
           office_required = false,
           flags = '{}'::text[],
           scores = excluded.scores,
           notes = excluded.notes`,
        [leave.team_member_id, day, JSON.stringify(attendanceScores("approved_leave", 0, 0)), `${leave.leave_type} leave approved`],
      )));
    }

    await logActivity({
      action: `timebook.leave_${status}`,
      page: "timebook",
      resource_type: "leave_request",
      resource_id: leaveId,
      resource_label: `${leave.leave_type} · ${leave.start_date} to ${leave.end_date}`,
      metadata: { team_member_id: leave.team_member_id },
    });

    return NextResponse.json({ ok: true, leave_request: data });
  }

  if (action === "correct_entry") {
    const entryId = body.entry_id;
    if (!entryId) return NextResponse.json({ ok: false, error: "entry_id is required." }, { status: 400 });

    const allowed = ["attendance_status", "clock_in_at", "clock_out_at", "break_start_at", "break_end_at", "notes"];
    const patch: Record<string, any> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key] || null;
    }
    if (patch.clock_in_at && patch.clock_out_at) {
      const total = workMinutes(patch.clock_in_at, patch.clock_out_at, patch.break_start_at, patch.break_end_at);
      const overtime = overtimeMinutes(patch.clock_out_at);
      const status = (patch.attendance_status || "on_time") as AttendanceStatus;
      patch.total_work_minutes = total;
      patch.overtime_minutes = overtime;
      patch.early_logout = isEarlyLogout(patch.clock_out_at);
      patch.scores = attendanceScores(status, total, overtime);
    }

    const sets: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(patch)) {
      values.push(key === "scores" ? JSON.stringify(value) : value);
      sets.push(`${key} = $${values.length}${key === "scores" ? "::jsonb" : ""}`);
    }
    if (sets.length === 0) return NextResponse.json({ ok: false, error: "No correction fields supplied." }, { status: 400 });
    values.push(entryId);
    const data = await glashOne<any>(
      `update public.team_time_entries set ${sets.join(", ")} where id = $${values.length} returning *`,
      values,
    );

    await glashQuery(
      `insert into public.team_time_events
        (entry_id, team_member_id, event_type, work_date, metadata)
       values ($1,$2,'admin_correction',$3,$4::jsonb)`,
      [entryId, data.team_member_id, data.work_date, JSON.stringify({ patch, corrected_by: session?.email ?? session?.name ?? null })],
    );
    await logActivity({
      action: "timebook.correct_entry",
      page: "timebook",
      resource_type: "team_time_entry",
      resource_id: entryId,
      resource_label: data.work_date,
      metadata: patch,
    });

    return NextResponse.json({ ok: true, entry: data });
  }

  return NextResponse.json({ ok: false, error: "Unsupported timebook action." }, { status: 400 });
}
