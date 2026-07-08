/**
 * Performance / efficiency aggregation for the Attendance Booklet.
 *
 * Turns raw `biometric_attendance` rows into the per-member scorecards used to
 * judge team performance: attendance rate, punctuality, hours, overtime, and a
 * blended efficiency score. Pure functions - no DB - so they're trivial to test
 * and reuse on both server (booklet API) and client (live preview).
 */
import { isWorkDay, lagosDate } from "@/lib/timebook";

export interface BiometricScores {
  attendance?: number | null;
  punctuality?: number | null;
  work_hours?: number | null;
  task_completion?: number | null;
  communication?: number | null;
  productivity?: number | null;
}

export interface AttendanceRow {
  team_member_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  attendance_status: string;
  total_work_minutes: number | null;
  overtime_minutes: number | null;
  early_logout: boolean | null;
  scores: BiometricScores | null;
}

export interface MemberSummary {
  team_member_id: string;
  work_days: number;          // scheduled work days in the range (Mon–Fri)
  present_days: number;       // days with a check-in
  on_time_days: number;
  early_days: number;
  late_days: number;
  half_days: number;
  absent_days: number;
  leave_days: number;
  incomplete_days: number;    // checked in but never checked out
  total_work_minutes: number;
  total_overtime_minutes: number;
  avg_work_minutes: number;
  attendance_rate: number;    // present / work_days, 0–100
  punctuality_rate: number;   // (early+on_time) / present, 0–100
  avg_productivity: number;   // mean of daily productivity scores, 0–100
  efficiency_score: number;   // blended headline metric, 0–100
}

/** Inclusive count of scheduled work days (Mon–Fri, Lagos) between two dates. */
export function countWorkDays(from: string, to: string): number {
  const start = new Date(`${from}T12:00:00+01:00`);
  const end = new Date(`${to}T12:00:00+01:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let days = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (isWorkDay(lagosDate(d))) days += 1;
  }
  return days;
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Build a per-member summary from that member's attendance rows over a range.
 * `workDaysInRange` is the scheduled-day denominator (so absences count even
 * with no row written).
 */
export function summariseMember(
  teamMemberId: string,
  rows: AttendanceRow[],
  workDaysInRange: number,
): MemberSummary {
  let present = 0, onTime = 0, early = 0, late = 0, half = 0, absent = 0, leave = 0, incomplete = 0;
  let workMin = 0, overtime = 0, productivitySum = 0, productivityCount = 0;

  for (const row of rows) {
    switch (row.attendance_status) {
      case "early": early += 1; break;
      case "on_time": onTime += 1; break;
      case "late": late += 1; break;
      case "half_day": half += 1; break;
      case "approved_leave": leave += 1; break;
      case "absent": absent += 1; break;
    }
    if (row.check_in_at) {
      present += 1;
      if (!row.check_out_at) incomplete += 1;
    }
    workMin += Number(row.total_work_minutes || 0);
    overtime += Number(row.overtime_minutes || 0);
    const prod = row.scores?.productivity;
    if (typeof prod === "number") {
      productivitySum += prod;
      productivityCount += 1;
    }
  }

  // Scheduled days the member simply never showed for (no row at all).
  const accountedDays = present + leave + absent;
  const unrecordedAbsent = Math.max(0, workDaysInRange - accountedDays);
  absent += unrecordedAbsent;

  const attendanceDenom = Math.max(0, workDaysInRange - leave); // leave days don't count against you
  const attendanceRate = attendanceDenom > 0 ? clampPct((present / attendanceDenom) * 100) : 100;
  const punctualityRate = present > 0 ? clampPct(((early + onTime) / present) * 100) : 0;
  const avgProductivity = productivityCount > 0 ? clampPct(productivitySum / productivityCount) : 0;
  const avgWorkMinutes = present > 0 ? Math.round(workMin / present) : 0;

  // Headline efficiency: attendance reliability + punctuality + sustained
  // daily productivity, lightly rewarded for overtime. Mirrors the weighting
  // philosophy of attendanceScores() in the geofence timebook.
  const overtimeBonus = Math.min(100, (overtime / 60) * 10);
  const efficiency = clampPct(
    attendanceRate * 0.35 +
    punctualityRate * 0.25 +
    avgProductivity * 0.30 +
    overtimeBonus * 0.10,
  );

  return {
    team_member_id: teamMemberId,
    work_days: workDaysInRange,
    present_days: present,
    on_time_days: onTime,
    early_days: early,
    late_days: late,
    half_days: half,
    absent_days: absent,
    leave_days: leave,
    incomplete_days: incomplete,
    total_work_minutes: workMin,
    total_overtime_minutes: overtime,
    avg_work_minutes: avgWorkMinutes,
    attendance_rate: attendanceRate,
    punctuality_rate: punctualityRate,
    avg_productivity: avgProductivity,
    efficiency_score: efficiency,
  };
}

/** Coarse efficiency band for badges/colour-coding in the booklet UI. */
export function efficiencyBand(score: number): "excellent" | "solid" | "watch" | "at_risk" {
  if (score >= 85) return "excellent";
  if (score >= 70) return "solid";
  if (score >= 50) return "watch";
  return "at_risk";
}
