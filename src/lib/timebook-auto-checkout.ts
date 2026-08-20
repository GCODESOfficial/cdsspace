import "server-only";
import { glashQuery } from "@/lib/glashdb/postgres";
import {
  attendanceScores,
  isEarlyLogout,
  lagosDate,
  lagosMinutes,
  overtimeMinutes,
  TIMEBOOK_SCHEDULE,
  workMinutes,
} from "@/lib/timebook";

interface OpenTimeEntry {
  id: string;
  team_member_id: string;
  work_date: string;
  attendance_status: "early" | "on_time" | "late" | "half_day" | "absent" | "approved_leave";
  current_status: string | null;
  clock_in_at: string;
  session_started_at: string | null;
  sessions: Array<{ clock_in_at: string; clock_out_at: string; minutes: number }> | null;
  break_start_at: string | null;
  break_end_at: string | null;
  flags: string[] | null;
}

export interface AutoCheckoutResult {
  entry_id: string;
  team_member_id: string;
  work_date: string;
  total_work_minutes: number;
  session_number: number;
}

function minutesToClock(minutes: number) {
  const hour = Math.floor(minutes / 60).toString().padStart(2, "0");
  const minute = (minutes % 60).toString().padStart(2, "0");
  return `${hour}:${minute}:00`;
}

export function autoCheckoutCutoffIso(workDate = lagosDate()) {
  return new Date(`${workDate}T${minutesToClock(TIMEBOOK_SCHEDULE.autoCheckoutMinutes)}+01:00`).toISOString();
}

export function autoCheckoutFinalizeIso(workDate = lagosDate()) {
  return new Date(`${workDate}T${minutesToClock(TIMEBOOK_SCHEDULE.autoCheckoutFinalizeMinutes)}+01:00`).toISOString();
}

export async function autoCheckoutOpenTimeEntries(input: {
  workDate?: string;
  now?: Date;
  force?: boolean;
  source?: string;
} = {}) {
  const now = input.now ?? new Date();
  const today = lagosDate(now);
  const workDate = input.workDate ?? today;
  const cutoffAt = autoCheckoutCutoffIso(workDate);
  const dueToday = lagosMinutes(now) >= TIMEBOOK_SCHEDULE.autoCheckoutFinalizeMinutes;

  // Sweep every unfinished date up to the requested date. Past dates are
  // always eligible; today's row is only a late-night safety close. This also
  // repairs attendance left open when nobody visited the portal after work.
  const dateRows = await glashQuery<{ work_date: string }>(
    `select distinct work_date::text as work_date
       from public.team_time_entries
      where work_date <= $1::date
        and clock_in_at is not null
        and clock_out_at is null
      order by work_date asc`,
    [workDate],
  );
  const eligibleDates = dateRows
    .map((row) => String(row.work_date).slice(0, 10))
    .filter((date) => input.force || date < today || (date === today && dueToday));
  const due = eligibleDates.length > 0;

  if (!due) {
    return { due: false, workDate, cutoffAt, closed: [] as AutoCheckoutResult[] };
  }

  const closed: AutoCheckoutResult[] = [];

  for (const entryDate of eligibleDates) {
    const regularCutoffAt = autoCheckoutCutoffIso(entryDate);
    const finalCutoffAt = autoCheckoutFinalizeIso(entryDate);
    const openEntries = await glashQuery<OpenTimeEntry>(
      `select id, team_member_id, work_date::text as work_date, attendance_status, current_status,
              clock_in_at, session_started_at, sessions, break_start_at, break_end_at, flags
         from public.team_time_entries
        where work_date = $1::date
          and clock_in_at is not null
          and clock_out_at is null
        order by clock_in_at asc`,
      [entryDate],
    );

    for (const entry of openEntries) {
      const sessionStart = entry.session_started_at || entry.clock_in_at;
      // A deliberate night session begins after the normal 18:15 cutoff and
      // is safely closed at 23:55 instead of being assigned a checkout before
      // its own start time.
      const automaticCheckoutAt = new Date(sessionStart).getTime() > new Date(regularCutoffAt).getTime()
        ? finalCutoffAt
        : regularCutoffAt;
      if (!input.force && new Date(automaticCheckoutAt).getTime() > now.getTime()) continue;
      const priorSessions = Array.isArray(entry.sessions) ? entry.sessions : [];
      const sessionMinutes = workMinutes(sessionStart, automaticCheckoutAt, entry.break_start_at, entry.break_end_at);
      const totalMinutes = priorSessions.reduce((sum, session) => sum + (Number(session?.minutes) || 0), 0) + sessionMinutes;
      const sessions = [...priorSessions, { clock_in_at: sessionStart, clock_out_at: automaticCheckoutAt, minutes: sessionMinutes }];
      const overtime = overtimeMinutes(automaticCheckoutAt);
      const early = isEarlyLogout(automaticCheckoutAt);
      const flags = Array.from(new Set([...(entry.flags ?? []), "auto_clock_out", ...(early ? ["early_logout"] : [])]));
      const scores = attendanceScores(entry.attendance_status, totalMinutes, overtime);

      const updated = await glashQuery<{ id: string }>(
        `update public.team_time_entries
            set clock_out_at = $2::timestamptz,
                sessions = $3::jsonb,
                current_status = 'offline',
                total_work_minutes = $4,
                overtime_minutes = $5,
                early_logout = $6,
                flags = $7::text[],
                scores = $8::jsonb
          where id = $1
            and clock_out_at is null
          returning id`,
        [entry.id, automaticCheckoutAt, JSON.stringify(sessions), totalMinutes, overtime, early, flags, JSON.stringify(scores)],
      );

      if (!updated[0]) continue;

      await glashQuery(
        `update public.team_work_tracking_sessions
            set status = 'stopped', ended_at = $2::timestamptz,
                pause_reason = 'attendance_auto_closed', updated_at = now()
          where time_entry_id = $1 and status in ('active','paused')`,
        [entry.id, automaticCheckoutAt],
      ).catch(() => []);

      await glashQuery(
        `insert into public.team_time_events
          (entry_id, team_member_id, event_type, work_date, from_status, to_status, flags, metadata)
         values ($1,$2,'clock_out',$3,$4,'offline',$5::text[],$6::jsonb)`,
        [
          entry.id,
          entry.team_member_id,
          entryDate,
          entry.current_status,
          flags,
          JSON.stringify({
            source: input.source || "auto_checkout",
            automatic: true,
            cutoff_at: automaticCheckoutAt,
            cutoff_kind: automaticCheckoutAt === finalCutoffAt ? "night_session" : "scheduled_day",
            total_work_minutes: totalMinutes,
            overtime_minutes: overtime,
            session_number: sessions.length,
          }),
        ],
      ).catch(() => []);

      closed.push({
        entry_id: entry.id,
        team_member_id: entry.team_member_id,
        work_date: entryDate,
        total_work_minutes: totalMinutes,
        session_number: sessions.length,
      });
    }
  }

  return { due: true, workDate, cutoffAt, closed };
}
