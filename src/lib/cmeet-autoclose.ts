import { glashQuery } from "@/lib/glashdb/postgres";

/** A live cMeet with no participant presence for this long is auto-ended. */
export const CMEET_IDLE_MINUTES = 30;

/**
 * End any live meeting that's been empty (no heartbeat) for the idle window.
 * `last_active_at` is bumped by the in-room heartbeat; we fall back to
 * started_at / created_at so an instant meeting nobody joined still closes.
 *
 * Wrapped in try/catch so a missing `last_active_at` column (migration not yet
 * applied) never breaks the callers that sweep on read.
 */
export async function closeStaleCmeets(): Promise<{ id: string; room_code: string }[]> {
  try {
    return await glashQuery<{ id: string; room_code: string }>(
      `update public.team_meetings
          set status = 'ended', ended_at = now()
        where status = 'live'
          and coalesce(last_active_at, started_at, created_at) < now() - ($1 || ' minutes')::interval
        returning id, room_code`,
      [String(CMEET_IDLE_MINUTES)],
    );
  } catch {
    return [];
  }
}

/** Mark a live meeting as active right now (called by the in-room heartbeat). */
export async function touchCmeet(roomCode: string): Promise<void> {
  try {
    await glashQuery(
      `update public.team_meetings set last_active_at = now() where room_code = $1 and status = 'live'`,
      [roomCode],
    );
  } catch {
    // last_active_at column may not exist yet; ignore.
  }
}
