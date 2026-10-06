import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { getTeamSessionFromToken } from "@/lib/team-auth";
import { createTeamSession } from "@/lib/team-login-security";
import { canReuseStaffPortalSession } from "@/lib/staff-portal-identity.mjs";
import { parseTeamBearer, teamBearerToken } from "@/lib/team-mobile-session-core.mjs";
import { serializeTeamMember } from "@/lib/team-mobile";
import { SUPER_ADMIN_EMAIL, adminMobileJson, resolveAdminTeamMember } from "@/lib/admin-mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → team ("Open team portal") for the app, like /api/admin/team-bridge.
// The app sends its current team token (if any) as `teamToken`; a live
// same-identity team session is reused, otherwise a team device session is
// created for the linked team member and returned as a Bearer token.
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) return adminMobileJson({ ok: false, error: "Admin session required." }, 401);

    const body = (await req.json().catch(() => null)) as { teamToken?: unknown } | null;
    const existingToken = parseTeamBearer(typeof body?.teamToken === "string" ? `Bearer ${body.teamToken}` : null);
    const existingTeam = existingToken ? await getTeamSessionFromToken(existingToken) : null;
    if (existingTeam?.is_sub_admin && canReuseStaffPortalSession(admin, existingTeam, SUPER_ADMIN_EMAIL)) {
      return adminMobileJson({ ok: true, reused: true, member: await serializeTeamMember(existingTeam.id, existingToken) });
    }

    const teamMember = await resolveAdminTeamMember(admin);
    if (!teamMember) {
      return adminMobileJson({ ok: false, error: "This admin account is not linked to an active team member." }, 403);
    }
    const { sessionToken, expiresAt } = await createTeamSession(teamMember.id, req, { source: "admin_bridge", clientDevice: { platform: "Mobile app" } });
    return adminMobileJson({
      ok: true,
      reused: false,
      token: teamBearerToken(sessionToken),
      expiresAt,
      member: await serializeTeamMember(teamMember.id, sessionToken),
    });
  } catch {
    return adminMobileJson({ ok: false, error: "Portal switching is temporarily unavailable." }, 503);
  }
}
