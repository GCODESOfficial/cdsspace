import { TEAM_SESSION_COOKIE } from "@/lib/team-auth";
import { mobileJson } from "@/lib/mobile-api";
import { teamBearerToken } from "@/lib/team-mobile-session-core.mjs";
import { serializeTeamMember } from "@/lib/team-mobile";
import { GET as webGetInvite, POST as webCompleteInvite } from "@/app/api/team-invites/[token]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

// The web invite routes, answered for the app: GET returns the invite as-is;
// POST creates the account and returns the new device session as a Bearer
// token (the web sets it as a cookie). The invite stands in for the access check.
export async function GET(req: Request, ctx: Ctx) {
  return webGetInvite(req, ctx);
}

export async function POST(req: Request, ctx: Ctx) {
  const response = await webCompleteInvite(req, ctx);
  const body = await response.clone().json().catch(() => ({}));
  if (!response.ok || !body?.ok) return mobileJson(body, response.status);

  const sessionToken = response.cookies.get(TEAM_SESSION_COOKIE)?.value;
  const memberId = body.member?.id;
  if (!sessionToken || !memberId) {
    return mobileJson({ ok: false, error: "Your account was created. Sign in to continue." }, 409);
  }
  return mobileJson({
    ok: true,
    token: teamBearerToken(sessionToken),
    member: await serializeTeamMember(memberId, sessionToken),
  });
}
