import { getTeamSession } from "@/lib/team-auth";
import { adminClaimsForTeamMember, adminMobileJson, issueAdminMobileToken, serializeAdmin } from "@/lib/admin-mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Team → admin ("Open admin portal") for the app, like /api/admin-check with a
// team session: a sub-admin's team Bearer token ("cdst1.…") is exchanged for an
// admin token tied to the same stable team-member ID. The team session stays.
export async function POST() {
  let team;
  try {
    team = await getTeamSession();
  } catch {
    return adminMobileJson({ ok: false, error: "Admin portal is temporarily unavailable. Your team session is still active." }, 503);
  }
  if (!team) return adminMobileJson({ ok: false, error: "Your team session has ended. Sign in again." }, 401);
  const claims = await adminClaimsForTeamMember(team);
  if (!claims) return adminMobileJson({ ok: false, error: "This team account does not have admin access." }, 403);
  const { token, expiresAt, issuedAt } = issueAdminMobileToken(claims);
  return adminMobileJson({ ok: true, token, expiresAt, admin: serializeAdmin(claims, issuedAt) });
}
