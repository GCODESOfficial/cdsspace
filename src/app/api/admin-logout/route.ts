import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { TEAM_SESSION_COOKIE } from "@/lib/team-auth";
import { glashQuery } from "@/lib/glashdb/postgres";
import { getAdminSession } from "@/lib/admin-session";
import { stopResearchRun } from "@/lib/prospect-research-runner";

export async function POST() {
  const store = await cookies();
  // Background research belongs to the admin who started it, so signing out
  // stops it rather than leaving it running for nobody.
  const admin = await getAdminSession().catch(() => null);
  if (admin) {
    await stopResearchRun({
      actorKey: String(admin.memberId || admin.email || "admin"),
      reason: "the admin who started it signed out",
    }).catch(() => 0);
  }
  const teamToken = store.get(TEAM_SESSION_COOKIE)?.value;
  if (teamToken) {
    await glashQuery(
      "update public.team_device_sessions set revoked_at = now(), revoke_reason = 'logout' where session_token = $1 and revoked_at is null",
      [teamToken],
    ).catch(() => []);
    await glashQuery(
      "update public.team_members set session_token = null, session_expires_at = null where session_token = $1",
      [teamToken],
    ).catch(() => []);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("admin_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(TEAM_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
