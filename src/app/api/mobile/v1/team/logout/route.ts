import { glashQuery } from "@/lib/glashdb/postgres";
import { mobileJson } from "@/lib/mobile-api";
import { forgetCachedTeamSession, readTeamBearerToken } from "@/lib/team-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ends the app's team device session (same effect as /api/team/logout on the web).
export async function POST() {
  const token = await readTeamBearerToken();
  if (token) {
    forgetCachedTeamSession(token);
    await glashQuery(
      "update public.team_device_sessions set revoked_at = now(), revoke_reason = 'logout' where session_token = $1 and revoked_at is null",
      [token],
    ).catch(() => []);
    await glashQuery(
      "update public.team_members set session_token = null, session_expires_at = null where session_token = $1",
      [token],
    ).catch(() => []);
  }
  return mobileJson({ ok: true });
}
