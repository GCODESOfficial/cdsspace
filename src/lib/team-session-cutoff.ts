import "server-only";

import { glashQuery } from "@/lib/glashdb/postgres";
import { dailyTeamCutoffIsDue, mostRecentTeamSessionCutoffIso } from "@/lib/team-session-policy";
import { forgetCachedTeamSession } from "@/lib/team-auth";

export async function enforceDailyTeamSessionCutoff(now = new Date()) {
  const cutoffAt = mostRecentTeamSessionCutoffIso(now);

  const revoked = await glashQuery<{ id: string; team_member_id: string; session_token: string }>(
    `update public.team_device_sessions
        set revoked_at = now(), revoke_reason = 'daily_1815_cutoff'
      where revoked_at is null
        and created_at < $1::timestamptz
      returning id, team_member_id, session_token`,
    [cutoffAt],
  );

  if (revoked.length) {
    for (const session of revoked) forgetCachedTeamSession(session.session_token);
    await glashQuery(
      `update public.team_members
          set session_token = null, session_expires_at = null
        where session_token = any($1::text[])`,
      [revoked.map((session) => session.session_token)],
    ).catch(() => []);
  }

  return { due: dailyTeamCutoffIsDue(now), cutoffAt, revoked: revoked.length };
}
