// Pure helpers for team sessions used by the mobile app, kept free of server
// imports so they can be tested directly.
//
// The app has no cookies, so it sends its team device session as
// "Authorization: Bearer cdst1.<session token>". The token is the same row in
// public.team_device_sessions the web cookie uses, so the three-device limit, the
// 18:15 Lagos cutoff, sign-out and admin revocation all apply unchanged.

export const TEAM_BEARER_PREFIX = "cdst1";

const TOKEN_PATTERN = /^cdst1\.([a-f0-9]{64})$/;

export function teamBearerToken(sessionToken) {
  return `${TEAM_BEARER_PREFIX}.${sessionToken}`;
}

// "Authorization: Bearer cdst1.…" → the session token, or null for anything
// else (client "cdsm1." tokens, cron secrets and API keys have other shapes).
export function parseTeamBearer(headerValue) {
  if (typeof headerValue !== "string" || headerValue.length > 512) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(headerValue.trim());
  if (!match) return null;
  const token = TOKEN_PATTERN.exec(match[1]);
  return token ? token[1] : null;
}
