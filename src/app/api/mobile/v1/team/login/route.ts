import { NextRequest } from "next/server";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";
import { hashPassword } from "@/lib/team-auth";
import { createTeamSession, locationFromPayload } from "@/lib/team-login-security";
import { clientRequestContext, consumeSecurityRateLimit } from "@/lib/client-login-security";
import { BLOCKED_EMAIL_MESSAGE, isBlockedEmail } from "@/lib/security/email-blocklist";
import { teamBearerToken } from "@/lib/team-mobile-session-core.mjs";
import { serializeTeamMember, teamAccessTokenMember } from "@/lib/team-mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => mobileJson({ ok: false, error, ...extra }, status);

// Team sign-in for the mobile app. Same checks as /api/team/login, plus the
// access token from the emailed code (it must belong to the account signing in).
// Returns the device session as a Bearer token instead of a cookie; as on the web,
// a member can be signed in on up to three devices and a fourth ends the oldest.
export async function POST(req: NextRequest) {
  const body = await readMobileBody(req);
  const identifier = str(body.identifier).trim().toLowerCase();
  const password = str(body.password);

  const accessMemberId = teamAccessTokenMember(body.accessToken);
  if (!accessMemberId) {
    return fail("Your team access check has expired. Verify your email again.", 403, { accessExpired: true });
  }
  if (!identifier || !password.trim()) return fail("Username/email and password are required", 400);
  if (isBlockedEmail(identifier)) return fail(BLOCKED_EMAIL_MESSAGE, 403);

  const context = await clientRequestContext();
  const [networkBlocked, identityBlocked] = await Promise.all([
    consumeSecurityRateLimit({ bucket: "team-login-network", identifier: context.ipHash, limit: 30, windowSeconds: 15 * 60, blockSeconds: 15 * 60 }),
    consumeSecurityRateLimit({ bucket: "team-login-identity", identifier, limit: 10, windowSeconds: 15 * 60, blockSeconds: 15 * 60 }),
  ]);
  if (networkBlocked || identityBlocked) return fail("Too many sign-in attempts. Wait a while and try again.", 429);

  const member = await glashMaybeOne<{
    id: string;
    email: string;
    is_active: boolean;
    password_salt: string;
    password_hash: string;
  }>(
    `select id, email, is_active, password_salt, password_hash
       from public.team_members
      where lower(email) = $1 or lower(username) = $1
      limit 1`,
    [identifier],
  );
  if (!member || !member.password_hash || hashPassword(password, member.password_salt) !== member.password_hash) {
    return fail("Invalid credentials", 401);
  }
  if (!member.is_active) return fail("Account is inactive", 403);
  if (isBlockedEmail(member.email)) return fail(BLOCKED_EMAIL_MESSAGE, 403);
  if (member.id !== accessMemberId) {
    return fail("Sign in with the team account that received the access code.", 403);
  }

  const device = body.client_device && typeof body.client_device === "object" ? (body.client_device as Record<string, unknown>) : {};
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : null);
  const { sessionToken, expiresAt } = await createTeamSession(member.id, req, {
    source: "mobile_app",
    location: locationFromPayload(body.location),
    clientDevice: {
      platform: text(device.platform, 120),
      timezone: text(device.timezone, 120),
      language: text(device.language, 40),
      screen: text(device.screen, 40),
    },
  });

  return mobileJson({
    ok: true,
    token: teamBearerToken(sessionToken),
    expiresAt,
    member: await serializeTeamMember(member.id, sessionToken),
  });
}
