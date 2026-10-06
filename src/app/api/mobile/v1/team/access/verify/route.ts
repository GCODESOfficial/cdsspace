import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";
import { consumeSecurityRateLimit } from "@/lib/client-login-security";
import {
  TEAM_ACCESS_CODE_TTL_SECONDS,
  TEAM_ACCESS_MAX_ATTEMPTS,
  TEAM_ACCESS_TOKEN_TTL_SECONDS,
  createTeamAccessToken,
  openTeamAccessChallenge,
  teamAccessCodeMatches,
} from "@/lib/team-mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WRONG_CODE = "That code is not correct. Check the email and try again.";

// Step 2: the code from the email → a short-lived access token that the team
// login requires. Wrong codes answer 200 { ok: false } so the app shows them inline.
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  const code = str(body.code).replace(/\D/g, "").slice(0, 6);
  const challenge = openTeamAccessChallenge(body.challengeId);
  if (!challenge || code.length !== 6) return mobileJson({ ok: false, error: WRONG_CODE });
  if (challenge.exp < Date.now()) {
    return mobileJson({ ok: false, expired: true, error: "This code has expired. Request a new one." });
  }

  const tooMany = await consumeSecurityRateLimit({
    bucket: "team-access-verify",
    identifier: challenge.n,
    limit: TEAM_ACCESS_MAX_ATTEMPTS,
    windowSeconds: TEAM_ACCESS_CODE_TTL_SECONDS,
    blockSeconds: TEAM_ACCESS_CODE_TTL_SECONDS,
  });
  if (tooMany) return mobileJson({ ok: false, expired: true, error: "Too many attempts. Request a new code." });
  if (!teamAccessCodeMatches(challenge, code)) return mobileJson({ ok: false, error: WRONG_CODE });

  // One code opens the gate once.
  const reused = await consumeSecurityRateLimit({
    bucket: "team-access-redeemed",
    identifier: challenge.n,
    limit: 1,
    windowSeconds: TEAM_ACCESS_CODE_TTL_SECONDS,
    blockSeconds: TEAM_ACCESS_CODE_TTL_SECONDS,
  });
  if (reused) return mobileJson({ ok: false, expired: true, error: "This code was already used. Request a new one." });

  const member = await glashMaybeOne<{ id: string }>(
    "select id from public.team_members where id = $1 and is_active = true limit 1",
    [challenge.m],
  );
  if (!member) return mobileJson({ ok: false, error: WRONG_CODE });

  return mobileJson({
    ok: true,
    accessToken: createTeamAccessToken(member.id),
    expiresInSeconds: TEAM_ACCESS_TOKEN_TTL_SECONDS,
  });
}
