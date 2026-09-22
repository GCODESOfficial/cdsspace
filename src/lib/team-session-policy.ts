import { lagosDate, lagosMinutes, TIMEBOOK_SCHEDULE } from "@/lib/timebook";

export const TEAM_DAILY_SESSION_CUTOFF_MINUTES = TIMEBOOK_SCHEDULE.autoCheckoutMinutes;

function minutesToClock(minutes: number) {
  const hour = Math.floor(minutes / 60).toString().padStart(2, "0");
  const minute = (minutes % 60).toString().padStart(2, "0");
  return `${hour}:${minute}:00`;
}

export function teamDailySessionCutoffIso(now = new Date()) {
  return new Date(`${lagosDate(now)}T${minutesToClock(TEAM_DAILY_SESSION_CUTOFF_MINUTES)}+01:00`).toISOString();
}

export function mostRecentTeamSessionCutoffIso(now = new Date()) {
  const todayCutoff = new Date(teamDailySessionCutoffIso(now));
  if (now.getTime() >= todayCutoff.getTime()) return todayCutoff.toISOString();
  return new Date(todayCutoff.getTime() - 24 * 60 * 60 * 1000).toISOString();
}

export function dailyTeamCutoffIsDue(now = new Date()) {
  return lagosMinutes(now) >= TEAM_DAILY_SESSION_CUTOFF_MINUTES;
}

/**
 * Sessions created before today's 18:15 Lagos cutoff are invalid after the
 * cutoff. A deliberate login after 18:15 remains valid until the next day's
 * cutoff, which gives a member the requested explicit re-entry path.
 */
export function sessionRequiresDailyLogout(createdAt: string | null | undefined, now = new Date()) {
  if (!createdAt) return true;
  const created = new Date(createdAt).getTime();
  return !Number.isFinite(created) || created < new Date(mostRecentTeamSessionCutoffIso(now)).getTime();
}
