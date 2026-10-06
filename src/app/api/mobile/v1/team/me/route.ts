import { mobileJson } from "@/lib/mobile-api";
import { getTeamSession, readTeamBearerToken } from "@/lib/team-auth";
import { serializeTeamMember } from "@/lib/team-mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The signed-in team member, refreshed whenever the app opens.
// 401 once the session ends (sign-in elsewhere, 18:15 cutoff, deactivation).
export async function GET() {
  let session;
  try {
    session = await getTeamSession();
  } catch {
    return mobileJson({ ok: false, temporarilyUnavailable: true, error: "The team portal is temporarily unavailable." }, 503);
  }
  if (!session) return mobileJson({ ok: false, error: "Your team session has ended. Sign in again." }, 401);
  const member = await serializeTeamMember(session.id, await readTeamBearerToken());
  if (!member) return mobileJson({ ok: false, error: "Your team session has ended. Sign in again." }, 401);
  return mobileJson({ ok: true, member });
}
