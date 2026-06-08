/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { TEAM_SESSION_COOKIE } from "@/lib/team-auth";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";

export async function POST() {
  const store = await cookies();
  const token = store.get(TEAM_SESSION_COOKIE)?.value;

  if (token) {
    await glashQuery(
      "update public.team_device_sessions set revoked_at = now(), revoke_reason = 'logout' where session_token = $1 and revoked_at is null",
      [token],
    ).catch(() => []);
    await glashQuery(
      "update public.team_members set session_token = null, session_expires_at = null where session_token = $1",
      [token],
    ).catch(() => []);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(TEAM_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
