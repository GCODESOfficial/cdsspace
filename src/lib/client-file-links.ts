import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getGlashDbServiceRoleConfig } from "@/lib/glashdb/env";

/**
 * Short-lived signed links for client files served by an authenticated route.
 * A browser the mobile app opens has no session cookie or Bearer token, so the
 * app is given a link that carries its own proof: the owner, the file and an
 * expiry, signed with the server secret. The route still checks ownership in the
 * database; the signature only stands in for the session.
 */

const LINK_TTL_SECONDS = 15 * 60;

function signature(userId: string, fileId: string, expires: number) {
  return createHmac("sha256", getGlashDbServiceRoleConfig().serviceRoleKey)
    .update(`cds-client-file-link:${userId}:${fileId}:${expires}`)
    .digest("base64url");
}

export function signedClientFileQuery(userId: string, fileId: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const expires = nowSeconds + LINK_TTL_SECONDS;
  return new URLSearchParams({ u: userId, exp: String(expires), sig: signature(userId, fileId, expires) }).toString();
}

/** The owner's user ID if the link is valid and unexpired, otherwise null. */
export function verifySignedClientFileQuery(fileId: string, params: URLSearchParams) {
  const userId = params.get("u") || "";
  const expires = Number(params.get("exp"));
  const supplied = params.get("sig") || "";
  if (!userId || !Number.isInteger(expires) || expires <= Math.floor(Date.now() / 1000) || !supplied) return null;
  const expected = Buffer.from(signature(userId, fileId, expires));
  const given = Buffer.from(supplied);
  return expected.length === given.length && timingSafeEqual(expected, given) ? userId : null;
}
