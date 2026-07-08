import { NextRequest, NextResponse } from "next/server";
import {
  TEAM_SESSION_COOKIE,
  hashPassword,
  sessionCookieOptions,
} from "@/lib/team-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { createTeamSession } from "@/lib/team-login-security";
import { insertActivityLog } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { identifier, password } = body;
  if (!identifier?.trim() || !password?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Username/email and password are required" },
      { status: 400 },
    );
  }

  const id = String(identifier).trim().toLowerCase();
  const member = await glashMaybeOne<{
    id: string;
    full_name: string;
    username: string;
    is_sub_admin: boolean;
    is_active: boolean;
    password_salt: string;
    password_hash: string;
  }>(
    `select id, full_name, username, is_sub_admin, is_active, password_salt, password_hash
     from public.team_members
     where lower(email) = $1 or lower(username) = $1
     limit 1`,
    [id],
  );

  if (!member) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }
  if (!member.is_active) {
    return NextResponse.json({ ok: false, error: "Account is inactive" }, { status: 403 });
  }

  const expected = hashPassword(password, member.password_salt);
  if (expected !== member.password_hash) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  // Login only authenticates. Attendance/clock-in happens separately through
  // the geofenced timebook flow (POST /api/team/timebook action=clock_in), so
  // logging in never bypasses the office geofence check.
  const { member: sessionMember, sessionToken, deviceType } = await createTeamSession(member.id, req);
  void insertActivityLog({
    actor_kind: "team",
    actor_id: member.id,
    actor_name: member.full_name || member.username,
    actor_is_admin: false,
    action: "team.login",
    page: "team/login",
    resource_type: "team_session",
    resource_id: member.id,
    resource_label: `${deviceType} login`,
    metadata: {
      source: "team_login",
      device_type: deviceType,
      user_agent: req.headers.get("user-agent") || null,
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    },
  }).catch((err) => console.error("[audit] team login log failed:", err));

  const res = NextResponse.json({ ok: true, member: sessionMember, device_type: deviceType });
  res.cookies.set(TEAM_SESSION_COOKIE, sessionToken, sessionCookieOptions());
  return res;
}
