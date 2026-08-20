/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery } from "@/lib/glashdb/postgres";
import { isWorkDay, lagosDate } from "@/lib/timebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canViewMonthlyAttendance(session: { role: string; permissions: string[] }) {
  return session.role === "super_admin"
    || hasPermission(session.permissions, "timebook")
    || hasPermission(session.permissions, "timebook.view")
    || hasPermission(session.permissions, "team_members");
}

function validMonth(value: string | null) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value || "") ? value! : lagosDate().slice(0, 7);
}

function validUuid(value: string | null) {
  return /^[0-9a-f-]{36}$/i.test(value || "") ? value! : null;
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0, 12)).toISOString().slice(0, 10);
}

function dateKey(value: unknown) {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return lagosDate(value);
  return "";
}

function datesBetween(from: string, to: string) {
  if (!from || !to || from > to) return [];
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00+01:00`);
  const stop = new Date(`${to}T12:00:00+01:00`);
  while (cursor <= stop) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function workDates(from: string, to: string) {
  return datesBetween(from, to).filter((date) => isWorkDay(date));
}

function completedSessionCount(entry: any) {
  const sessions = Array.isArray(entry?.sessions) ? entry.sessions.length : 0;
  if (!entry?.clock_in_at) return 0;
  if (sessions === 0) return 1;
  return sessions + (entry.clock_out_at ? 0 : 1);
}

function roundRate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canViewMonthlyAttendance(session)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const month = validMonth(req.nextUrl.searchParams.get("month"));
  const memberId = validUuid(req.nextUrl.searchParams.get("member_id"));
  const from = `${month}-01`;
  const to = monthEnd(month);
  const currentDate = lagosDate();
  if (from > currentDate) {
    return NextResponse.json({ ok: false, error: "A future month cannot be used for attendance reporting." }, { status: 400 });
  }
  const asOf = currentDate < to ? currentDate : to;

  try {
    const [members, entries, checkInEvents, leaves] = await Promise.all([
      glashQuery<any>(
        `select m.id, m.full_name, m.email, m.role_title, m.department, m.joined_at, m.is_active
           from public.team_members m
          where ($1::uuid is null or m.id = $1::uuid)
            and (
              m.is_active = true
              or exists (
                select 1
                  from public.team_time_entries e
                 where e.team_member_id = m.id
                   and e.work_date between $2 and $3
              )
            )
          order by m.full_name`,
        [memberId, from, to],
      ),
      glashQuery<any>(
        `select id, team_member_id, work_date, attendance_status, clock_in_at, clock_out_at,
                total_work_minutes, overtime_minutes, early_logout, flags, sessions
           from public.team_time_entries
          where work_date between $1 and $2
            and ($3::uuid is null or team_member_id = $3::uuid)
          order by work_date`,
        [from, to, memberId],
      ),
      glashQuery<any>(
        `select team_member_id, work_date, count(*)::int as check_ins
           from public.team_time_events
          where event_type = 'clock_in'
            and work_date between $1 and $2
            and ($3::uuid is null or team_member_id = $3::uuid)
          group by team_member_id, work_date`,
        [from, to, memberId],
      ),
      glashQuery<any>(
        `select team_member_id, start_date, end_date, leave_type
           from public.team_leave_requests
          where status = 'approved'
            and start_date <= $2
            and end_date >= $1
            and ($3::uuid is null or team_member_id = $3::uuid)`,
        [from, to, memberId],
      ),
    ]);

    const entriesByMember = new Map<string, any[]>();
    for (const entry of entries) {
      const bucket = entriesByMember.get(entry.team_member_id) || [];
      bucket.push({ ...entry, work_date: dateKey(entry.work_date) });
      entriesByMember.set(entry.team_member_id, bucket);
    }

    const eventsByMemberDate = new Map<string, number>();
    for (const event of checkInEvents) {
      eventsByMemberDate.set(
        `${event.team_member_id}:${dateKey(event.work_date)}`,
        Number(event.check_ins || 0),
      );
    }

    const leaveDatesByMember = new Map<string, Set<string>>();
    for (const leave of leaves) {
      const leaveFrom = dateKey(leave.start_date) < from ? from : dateKey(leave.start_date);
      const leaveTo = dateKey(leave.end_date) > asOf ? asOf : dateKey(leave.end_date);
      const bucket = leaveDatesByMember.get(leave.team_member_id) || new Set<string>();
      for (const date of workDates(leaveFrom, leaveTo)) bucket.add(date);
      leaveDatesByMember.set(leave.team_member_id, bucket);
    }

    const rows = members.map((member: any) => {
      const joinedAt = dateKey(member.joined_at);
      const employmentStart = joinedAt && joinedAt > from ? joinedAt : from;
      const scheduledDates = workDates(employmentStart, to);
      const elapsedDates = workDates(employmentStart, asOf);
      const elapsedSet = new Set(elapsedDates);
      const memberEntries = entriesByMember.get(member.id) || [];
      const presentDateSet = new Set<string>();
      let earlyDays = 0;
      let onTimeDays = 0;
      let lateDays = 0;
      let halfDays = 0;
      let checkInCount = 0;
      let incompleteDays = 0;
      let earlyLogoutDays = 0;
      let totalWorkMinutes = 0;
      let overtimeMinutes = 0;
      let flaggedDays = 0;

      for (const entry of memberEntries) {
        const entryDate = dateKey(entry.work_date);
        if (!entry.clock_in_at) continue;
        if (elapsedSet.has(entryDate)) {
          presentDateSet.add(entryDate);
          if (entry.attendance_status === "early") earlyDays += 1;
          if (entry.attendance_status === "on_time") onTimeDays += 1;
          if (entry.attendance_status === "late") lateDays += 1;
          if (entry.attendance_status === "half_day") halfDays += 1;
        }
        const eventCount = eventsByMemberDate.get(`${member.id}:${entryDate}`) || 0;
        checkInCount += eventCount || completedSessionCount(entry);
        if (!entry.clock_out_at && entryDate < currentDate) incompleteDays += 1;
        if (entry.early_logout) earlyLogoutDays += 1;
        if (Array.isArray(entry.flags) && entry.flags.length > 0) flaggedDays += 1;
        totalWorkMinutes += Number(entry.total_work_minutes || 0);
        overtimeMinutes += Number(entry.overtime_minutes || 0);
      }

      const memberLeaveDates = new Set(leaveDatesByMember.get(member.id) || []);
      for (const entry of memberEntries) {
        const entryDate = dateKey(entry.work_date);
        if (entry.attendance_status === "approved_leave" && elapsedSet.has(entryDate) && !entry.clock_in_at) {
          memberLeaveDates.add(entryDate);
        }
      }
      for (const presentDate of presentDateSet) memberLeaveDates.delete(presentDate);
      const leaveDays = memberLeaveDates.size;
      const expectedAttendanceDays = Math.max(0, elapsedDates.length - leaveDays);
      const presentDays = presentDateSet.size;
      const absentDays = Math.max(0, expectedAttendanceDays - presentDays);
      const attendanceRate = roundRate(presentDays, expectedAttendanceDays);
      const punctualityRate = roundRate(earlyDays + onTimeDays, presentDays);
      const reviewReasons: string[] = [];
      if (absentDays > 0) reviewReasons.push(`${absentDays} absence${absentDays === 1 ? "" : "s"}`);
      if (incompleteDays > 0) reviewReasons.push(`${incompleteDays} incomplete day${incompleteDays === 1 ? "" : "s"}`);
      if (flaggedDays > 0) reviewReasons.push(`${flaggedDays} flagged day${flaggedDays === 1 ? "" : "s"}`);
      if (lateDays + halfDays > 2) reviewReasons.push("Punctuality pattern");
      const payrollStatus = reviewReasons.length > 0
        ? "review"
        : lateDays + halfDays > 0
          ? "watch"
          : "ready";

      return {
        member: {
          id: member.id,
          full_name: member.full_name,
          email: member.email,
          role_title: member.role_title,
          department: member.department,
          joined_at: joinedAt || null,
          is_active: member.is_active,
        },
        scheduled_work_days: scheduledDates.length,
        elapsed_work_days: elapsedDates.length,
        expected_attendance_days: expectedAttendanceDays,
        present_days: presentDays,
        early_days: earlyDays,
        on_time_days: onTimeDays,
        late_days: lateDays,
        half_days: halfDays,
        check_in_count: checkInCount,
        leave_days: leaveDays,
        absent_days: absentDays,
        incomplete_days: incompleteDays,
        early_logout_days: earlyLogoutDays,
        flagged_days: flaggedDays,
        total_work_minutes: totalWorkMinutes,
        overtime_minutes: overtimeMinutes,
        attendance_rate: attendanceRate,
        punctuality_rate: punctualityRate,
        payroll_status: payrollStatus,
        review_reasons: reviewReasons,
      };
    });

    const totals = rows.reduce(
      (total, row) => {
        total.staff += 1;
        total.scheduled_work_days += row.scheduled_work_days;
        total.elapsed_work_days += row.elapsed_work_days;
        total.expected_attendance_days += row.expected_attendance_days;
        total.present_days += row.present_days;
        total.early_days += row.early_days;
        total.on_time_days += row.on_time_days;
        total.late_days += row.late_days;
        total.half_days += row.half_days;
        total.check_in_count += row.check_in_count;
        total.leave_days += row.leave_days;
        total.absent_days += row.absent_days;
        total.review_count += row.payroll_status === "review" ? 1 : 0;
        total.total_work_minutes += row.total_work_minutes;
        return total;
      },
      {
        staff: 0,
        scheduled_work_days: 0,
        elapsed_work_days: 0,
        expected_attendance_days: 0,
        present_days: 0,
        early_days: 0,
        on_time_days: 0,
        late_days: 0,
        half_days: 0,
        check_in_count: 0,
        leave_days: 0,
        absent_days: 0,
        review_count: 0,
        total_work_minutes: 0,
      },
    );

    return NextResponse.json({
      ok: true,
      period: {
        month,
        from,
        to,
        as_of: asOf,
        is_complete: asOf === to,
      },
      filters: { member_id: memberId },
      totals: {
        ...totals,
        attendance_rate: roundRate(totals.present_days, totals.expected_attendance_days),
      },
      rows,
      generated_at: new Date().toISOString(),
      methodology: "Absences exclude approved leave and future working days. Check-ins count every recorded clock-in event, including multiple sessions on the same day.",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Monthly attendance report could not be generated." },
      { status: 500 },
    );
  }
}
