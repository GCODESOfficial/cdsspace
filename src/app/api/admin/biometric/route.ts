import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery, glashOne, glashMaybeOne } from "@/lib/glashdb/postgres";
import {
  lagosDate,
  attendanceStatus,
  attendanceScores,
  workMinutes,
  overtimeMinutes,
  isEarlyLogout,
  type AttendanceStatus,
} from "@/lib/timebook";
import {
  summariseMember,
  countWorkDays,
  type AttendanceRow,
} from "@/lib/biometric/performance";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ─────────────── Auth ─────────────── */

function can(session: AdminSession, key: string) {
  return (
    session.role === "super_admin" ||
    hasPermission(session.permissions, key) ||
    hasPermission(session.permissions, "team_members")
  );
}

async function requireStation(actionKey: string) {
  const session = await getAdminSession();
  if (!session) {
    return { session: null, denied: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  if (!can(session, actionKey)) {
    return { session, denied: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { session, denied: null as NextResponse | null };
}

function clientMeta(req: NextRequest) {
  return {
    ip:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null,
    ua: req.headers.get("user-agent") || null,
  };
}

async function logEvent(row: {
  team_member_id: string | null;
  event_type: string;
  work_date: string;
  finger_label?: string | null;
  match_score?: number | null;
  quality?: number | null;
  device_label?: string | null;
  operator_email?: string | null;
  operator_name?: string | null;
  ip?: string | null;
  ua?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await glashQuery(
      `insert into public.biometric_attendance_events
         (team_member_id, event_type, work_date, finger_label, match_score, quality,
          device_label, operator_email, operator_name, ip_address, user_agent, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
      [
        row.team_member_id,
        row.event_type,
        row.work_date,
        row.finger_label ?? null,
        row.match_score ?? null,
        row.quality ?? null,
        row.device_label ?? null,
        row.operator_email ?? null,
        row.operator_name ?? null,
        row.ip ?? null,
        row.ua ?? null,
        JSON.stringify(row.metadata ?? {}),
      ],
    );
  } catch {
    // Audit logging must never break the scan operation.
  }
}

/* ─────────────── GET ─────────────── */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") || "dashboard";

  if (view === "templates") {
    const { denied } = await requireStation("time_machine.operate");
    if (denied) return denied;
    const templates = await glashQuery(
      `select id, team_member_id as "memberId", finger_label as finger, template, template_format as format
       from public.team_fingerprints where is_active order by created_at`,
    );
    return NextResponse.json({ ok: true, templates });
  }

  if (view === "booklet") {
    const { denied } = await requireStation("time_machine.view");
    if (denied) return denied;
    const to = searchParams.get("to") || lagosDate();
    const from = searchParams.get("from") || to;
    const memberId = searchParams.get("member_id");

    const members = await glashQuery<{
      id: string; full_name: string; role_title: string | null; department: string | null; avatar_url: string | null;
    }>(
      memberId
        ? `select id, full_name, role_title, department, avatar_url from public.team_members where id = $1`
        : `select id, full_name, role_title, department, avatar_url from public.team_members where is_active order by full_name`,
      memberId ? [memberId] : [],
    );

    const rows = await glashQuery<AttendanceRow & { id: string }>(
      `select id, team_member_id, work_date::text, check_in_at, check_out_at, attendance_status,
              total_work_minutes, overtime_minutes, early_logout, scores
       from public.biometric_attendance
       where work_date between $1 and $2 ${memberId ? "and team_member_id = $3" : ""}
       order by team_member_id, work_date`,
      memberId ? [from, to, memberId] : [from, to],
    );

    const workDays = countWorkDays(from, to);
    const byMember = new Map<string, AttendanceRow[]>();
    for (const r of rows) {
      const list = byMember.get(r.team_member_id) ?? [];
      list.push(r);
      byMember.set(r.team_member_id, list);
    }

    const report = members.map((member) => {
      const memberRows = byMember.get(member.id) ?? [];
      return {
        member,
        summary: summariseMember(member.id, memberRows, workDays),
        days: memberRows,
      };
    });
    // Sort weakest performers first so managers see who needs attention.
    report.sort((a, b) => a.summary.efficiency_score - b.summary.efficiency_score);

    return NextResponse.json({ ok: true, from, to, work_days: workDays, report });
  }

  // Default: station dashboard.
  const { denied } = await requireStation("time_machine.view");
  if (denied) return denied;
  const today = lagosDate();

  const members = await glashQuery(
    `select tm.id, tm.full_name, tm.username, tm.email, tm.role_title, tm.department,
            tm.avatar_url, tm.is_active,
            coalesce(fp.fingers, 0) as enrolled_fingers,
            coalesce(fp.finger_labels, '{}'::text[]) as finger_labels,
            fp.last_enrolled_at
     from public.team_members tm
     left join (
       select team_member_id, count(*)::int as fingers,
              array_agg(finger_label order by finger_label) as finger_labels,
              max(updated_at) as last_enrolled_at
       from public.team_fingerprints where is_active
       group by team_member_id
     ) fp on fp.team_member_id = tm.id
     where tm.is_active
     order by tm.full_name`,
  );

  const todayRows = await glashQuery(
    `select ba.*, tm.full_name, tm.role_title, tm.department, tm.avatar_url
     from public.biometric_attendance ba
     join public.team_members tm on tm.id = ba.team_member_id
     where ba.work_date = $1
     order by ba.check_in_at desc nulls last`,
    [today],
  );

  const recentEvents = await glashQuery(
    `select e.id, e.team_member_id, e.event_type, e.finger_label, e.match_score,
            e.quality, e.created_at, tm.full_name
     from public.biometric_attendance_events e
     left join public.team_members tm on tm.id = e.team_member_id
     where e.work_date = $1
     order by e.created_at desc
     limit 25`,
    [today],
  );

  const stats = {
    team: members.length,
    enrolled: members.filter((m) => Number(m.enrolled_fingers) > 0).length,
    checked_in: todayRows.filter((r) => r.check_in_at).length,
    checked_out: todayRows.filter((r) => r.check_out_at).length,
    on_time: todayRows.filter((r) => r.attendance_status === "on_time" || r.attendance_status === "early").length,
    late: todayRows.filter((r) => r.attendance_status === "late" || r.attendance_status === "half_day").length,
  };

  return NextResponse.json({
    ok: true,
    work_date: today,
    members,
    today: todayRows,
    recent_events: recentEvents,
    stats,
  });
}

/* ─────────────── POST ─────────────── */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const { ip, ua } = clientMeta(req);
  const today = lagosDate();

  /* ---- Enroll a fingerprint ---- */
  if (action === "enroll") {
    const { session, denied } = await requireStation("time_machine.enroll");
    if (denied) return denied;
    const memberId = String(body.member_id || "");
    const finger = String(body.finger || "right_thumb");
    const template = String(body.template || "");
    if (!memberId || !template) {
      return NextResponse.json({ ok: false, error: "member_id and template are required" }, { status: 400 });
    }
    const member = await glashMaybeOne<{ full_name: string }>(
      `select full_name from public.team_members where id = $1`,
      [memberId],
    );
    if (!member) return NextResponse.json({ ok: false, error: "Team member not found" }, { status: 404 });

    const fp = await glashOne(
      `insert into public.team_fingerprints
         (team_member_id, finger_label, template, template_format, quality, device_label, enrolled_by, enrolled_by_name)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (team_member_id, finger_label) do update set
         template = excluded.template,
         template_format = excluded.template_format,
         quality = excluded.quality,
         device_label = excluded.device_label,
         enrolled_by = excluded.enrolled_by,
         enrolled_by_name = excluded.enrolled_by_name,
         is_active = true,
         updated_at = now()
       returning id, team_member_id, finger_label, quality, updated_at`,
      [
        memberId,
        finger,
        template,
        String(body.format || "zk"),
        body.quality ?? null,
        body.device_label ?? null,
        session!.email,
        session!.name,
      ],
    );

    await logEvent({
      team_member_id: memberId, event_type: "enroll", work_date: today, finger_label: finger,
      quality: body.quality ?? null, device_label: body.device_label ?? null,
      operator_email: session!.email, operator_name: session!.name, ip, ua,
    });
    await logActivity({
      action: "biometric.enroll", page: "time-machine", resource_type: "team_member",
      resource_id: memberId, resource_label: `${member.full_name} · ${finger}`,
      metadata: { finger, quality: body.quality ?? null },
    });

    return NextResponse.json({ ok: true, fingerprint: fp });
  }

  /* ---- Remove a fingerprint ---- */
  if (action === "unenroll") {
    const { session, denied } = await requireStation("time_machine.enroll");
    if (denied) return denied;
    const memberId = String(body.member_id || "");
    const finger = body.finger ? String(body.finger) : null;
    if (!memberId) return NextResponse.json({ ok: false, error: "member_id is required" }, { status: 400 });

    if (finger) {
      await glashQuery(`delete from public.team_fingerprints where team_member_id = $1 and finger_label = $2`, [memberId, finger]);
    } else {
      await glashQuery(`delete from public.team_fingerprints where team_member_id = $1`, [memberId]);
    }
    await logEvent({
      team_member_id: memberId, event_type: "unenroll", work_date: today, finger_label: finger,
      operator_email: session!.email, operator_name: session!.name, ip, ua,
    });
    await logActivity({
      action: "biometric.unenroll", page: "time-machine", resource_type: "team_member",
      resource_id: memberId, resource_label: finger ? `Removed ${finger}` : "Removed all fingerprints",
      metadata: { finger },
    });
    return NextResponse.json({ ok: true });
  }

  /* ---- Check in (1:N already resolved by the bridge) ---- */
  if (action === "check_in") {
    const { session, denied } = await requireStation("time_machine.operate");
    if (denied) return denied;
    const memberId = String(body.member_id || "");
    if (!memberId) return NextResponse.json({ ok: false, error: "member_id is required" }, { status: 400 });

    const member = await glashMaybeOne<{ full_name: string; role_title: string | null; department: string | null; avatar_url: string | null }>(
      `select full_name, role_title, department, avatar_url from public.team_members where id = $1 and is_active`,
      [memberId],
    );
    if (!member) return NextResponse.json({ ok: false, error: "Active team member not found" }, { status: 404 });

    const existing = await glashMaybeOne<{ check_in_at: string | null }>(
      `select check_in_at from public.biometric_attendance where team_member_id = $1 and work_date = $2`,
      [memberId, today],
    );
    if (existing?.check_in_at) {
      await logEvent({
        team_member_id: memberId, event_type: "duplicate_scan", work_date: today,
        finger_label: body.finger ?? null, match_score: body.match_score ?? null,
        operator_email: session!.email, operator_name: session!.name, ip, ua,
        metadata: { intent: "check_in" },
      });
      return NextResponse.json({ ok: true, state: "already_checked_in", member, check_in_at: existing.check_in_at });
    }

    const now = new Date().toISOString();
    const status = attendanceStatus(now);
    const scores = attendanceScores(status, 0, 0);

    const entry = await glashOne(
      `insert into public.biometric_attendance
         (team_member_id, work_date, check_in_at, attendance_status,
          check_in_finger, check_in_quality, check_in_match_score, check_in_device, check_in_by, scores)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       on conflict (team_member_id, work_date) do update set
         check_in_at = excluded.check_in_at,
         attendance_status = excluded.attendance_status,
         check_in_finger = excluded.check_in_finger,
         check_in_quality = excluded.check_in_quality,
         check_in_match_score = excluded.check_in_match_score,
         check_in_device = excluded.check_in_device,
         check_in_by = excluded.check_in_by,
         scores = excluded.scores,
         updated_at = now()
       returning *`,
      [
        memberId, today, now, status,
        body.finger ?? null, body.quality ?? null, body.match_score ?? null,
        body.device_label ?? null, session!.email, JSON.stringify(scores),
      ],
    );

    await logEvent({
      team_member_id: memberId, event_type: "check_in", work_date: today,
      finger_label: body.finger ?? null, match_score: body.match_score ?? null, quality: body.quality ?? null,
      device_label: body.device_label ?? null, operator_email: session!.email, operator_name: session!.name, ip, ua,
    });
    await logActivity({
      action: "biometric.check_in", page: "time-machine", resource_type: "team_member",
      resource_id: memberId, resource_label: `${member.full_name} checked in (${status})`,
      metadata: { status, at: now },
    });

    return NextResponse.json({ ok: true, state: "checked_in", member, entry, status });
  }

  /* ---- Check out ---- */
  if (action === "check_out") {
    const { session, denied } = await requireStation("time_machine.operate");
    if (denied) return denied;
    const memberId = String(body.member_id || "");
    if (!memberId) return NextResponse.json({ ok: false, error: "member_id is required" }, { status: 400 });

    const member = await glashMaybeOne<{ full_name: string; role_title: string | null; department: string | null; avatar_url: string | null }>(
      `select full_name, role_title, department, avatar_url from public.team_members where id = $1 and is_active`,
      [memberId],
    );
    if (!member) return NextResponse.json({ ok: false, error: "Active team member not found" }, { status: 404 });

    const existing = await glashMaybeOne<{ check_in_at: string | null; check_out_at: string | null; attendance_status: string }>(
      `select check_in_at, check_out_at, attendance_status from public.biometric_attendance where team_member_id = $1 and work_date = $2`,
      [memberId, today],
    );
    if (!existing?.check_in_at) {
      await logEvent({
        team_member_id: memberId, event_type: "identify_failed", work_date: today,
        operator_email: session!.email, operator_name: session!.name, ip, ua, metadata: { intent: "check_out", reason: "no_check_in" },
      });
      return NextResponse.json({ ok: true, state: "not_checked_in", member });
    }
    if (existing.check_out_at) {
      await logEvent({
        team_member_id: memberId, event_type: "duplicate_scan", work_date: today,
        operator_email: session!.email, operator_name: session!.name, ip, ua, metadata: { intent: "check_out" },
      });
      return NextResponse.json({ ok: true, state: "already_checked_out", member, check_out_at: existing.check_out_at });
    }

    const now = new Date().toISOString();
    const total = workMinutes(existing.check_in_at, now, null, null);
    const overtime = overtimeMinutes(now);
    const early = isEarlyLogout(now);
    const scores = attendanceScores(existing.attendance_status as AttendanceStatus, total, overtime);

    const entry = await glashOne(
      `update public.biometric_attendance set
         check_out_at = $3, total_work_minutes = $4, overtime_minutes = $5, early_logout = $6,
         check_out_finger = $7, check_out_quality = $8, check_out_match_score = $9, check_out_device = $10,
         check_out_by = $11, scores = $12::jsonb, updated_at = now()
       where team_member_id = $1 and work_date = $2
       returning *`,
      [
        memberId, today, now, total, overtime, early,
        body.finger ?? null, body.quality ?? null, body.match_score ?? null, body.device_label ?? null,
        session!.email, JSON.stringify(scores),
      ],
    );

    await logEvent({
      team_member_id: memberId, event_type: "check_out", work_date: today,
      finger_label: body.finger ?? null, match_score: body.match_score ?? null, quality: body.quality ?? null,
      device_label: body.device_label ?? null, operator_email: session!.email, operator_name: session!.name, ip, ua,
      metadata: { total_work_minutes: total, overtime_minutes: overtime, early_logout: early },
    });
    await logActivity({
      action: "biometric.check_out", page: "time-machine", resource_type: "team_member",
      resource_id: memberId, resource_label: `${member.full_name} checked out (${(total / 60).toFixed(1)}h)`,
      metadata: { total_work_minutes: total, overtime_minutes: overtime, early_logout: early },
    });

    return NextResponse.json({ ok: true, state: "checked_out", member, entry, total_work_minutes: total, overtime_minutes: overtime, early_logout: early });
  }

  /* ---- Admin manual correction ---- */
  if (action === "correct") {
    const { session, denied } = await requireStation("time_machine.correct");
    if (denied) return denied;
    const entryId = String(body.entry_id || "");
    if (!entryId) return NextResponse.json({ ok: false, error: "entry_id is required" }, { status: 400 });

    const current = await glashMaybeOne<{
      team_member_id: string; work_date: string; check_in_at: string | null; check_out_at: string | null; attendance_status: string;
    }>(`select team_member_id, work_date::text, check_in_at, check_out_at, attendance_status from public.biometric_attendance where id = $1`, [entryId]);
    if (!current) return NextResponse.json({ ok: false, error: "Entry not found" }, { status: 404 });

    const checkIn = body.check_in_at ?? current.check_in_at;
    const checkOut = body.check_out_at ?? current.check_out_at;
    const status = body.attendance_status ?? (checkIn ? attendanceStatus(checkIn) : current.attendance_status);
    const total = workMinutes(checkIn, checkOut, null, null);
    const overtime = overtimeMinutes(checkOut);
    const early = isEarlyLogout(checkOut);
    const scores = attendanceScores(status as AttendanceStatus, total, overtime);

    const entry = await glashOne(
      `update public.biometric_attendance set
         check_in_at = $2, check_out_at = $3, attendance_status = $4,
         total_work_minutes = $5, overtime_minutes = $6, early_logout = $7,
         scores = $8::jsonb, notes = coalesce($9, notes), updated_at = now()
       where id = $1 returning *`,
      [entryId, checkIn, checkOut, status, total, overtime, early, JSON.stringify(scores), body.notes ?? null],
    );

    await logEvent({
      team_member_id: current.team_member_id, event_type: "correction", work_date: current.work_date,
      operator_email: session!.email, operator_name: session!.name, ip, ua,
      metadata: { entry_id: entryId, status, check_in_at: checkIn, check_out_at: checkOut },
    });
    await logActivity({
      action: "biometric.correct", page: "time-machine", resource_type: "biometric_attendance",
      resource_id: entryId, resource_label: `Corrected ${current.work_date}`, metadata: { status },
    });

    return NextResponse.json({ ok: true, entry });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
