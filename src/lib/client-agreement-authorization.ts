import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getGlashDbServiceRoleConfig } from "@/lib/glashdb/env";

const PURPOSE = "client-legal-agreement";
const TOKEN_LIFETIME_SECONDS = 30 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AgreementAuthorizationClaims {
  purpose: typeof PURPOSE;
  subject: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
}

function signingSecret() {
  return getGlashDbServiceRoleConfig().serviceRoleKey;
}

function signature(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

/**
 * Mint a short-lived, single-purpose proof from the already authenticated
 * agreement page. It lets the agreement POST retain the exact same user ID if
 * an auth-cookie refresh completes between the document request and the fetch.
 */
export function createAgreementAuthorization(user: { id: string; email?: string | null }) {
  const now = Math.floor(Date.now() / 1000);
  const claims: AgreementAuthorizationClaims = {
    purpose: PURPOSE,
    subject: user.id,
    email: user.email || "",
    issuedAt: now,
    expiresAt: now + TOKEN_LIFETIME_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyAgreementAuthorization(token: unknown): AgreementAuthorizationClaims | null {
  if (typeof token !== "string" || token.length > 4096) return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;

  const expected = Buffer.from(signature(payload));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AgreementAuthorizationClaims;
    const now = Math.floor(Date.now() / 1000);
    if (
      claims.purpose !== PURPOSE ||
      !UUID_PATTERN.test(claims.subject) ||
      typeof claims.email !== "string" ||
      claims.email.length > 320 ||
      !Number.isInteger(claims.issuedAt) ||
      !Number.isInteger(claims.expiresAt) ||
      claims.issuedAt > now + 60 ||
      claims.expiresAt <= now ||
      claims.expiresAt - claims.issuedAt !== TOKEN_LIFETIME_SECONDS
    ) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
