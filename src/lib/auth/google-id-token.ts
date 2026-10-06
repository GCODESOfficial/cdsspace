import "server-only";

import { createPublicKey, createVerify, type JsonWebKey } from "node:crypto";

/**
 * Verifies the ID token that Google's native sign-in returns inside the mobile
 * app (no browser, no redirect). The token is an RS256 JWT signed by Google;
 * its audience must be one of our own OAuth client IDs.
 */

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const CLOCK_SKEW_SECONDS = 60;
const KEY_CACHE_MS = 60 * 60 * 1000;

type GoogleJwk = JsonWebKey & { kid?: string };

let cachedKeys: { keys: GoogleJwk[]; fetchedAt: number } | null = null;

async function googleKeys(forceRefresh = false) {
  if (!forceRefresh && cachedKeys && Date.now() - cachedKeys.fetchedAt < KEY_CACHE_MS) return cachedKeys.keys;
  const response = await fetch(JWKS_URL, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const body = await response.json().catch(() => ({})) as { keys?: GoogleJwk[] };
  if (!response.ok || !Array.isArray(body.keys)) throw new Error("Google signing keys are unavailable.");
  cachedKeys = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

/** The web client (GOOGLE_CLIENT_ID) plus the app's native iOS/Android clients. */
function allowedAudiences() {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ]
    .map((value) => value?.trim() || "")
    .filter(Boolean);
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

export type VerifiedGoogleIdentity = {
  subject: string;
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  picture: string;
};

export async function verifyGoogleIdToken(idToken: unknown): Promise<VerifiedGoogleIdentity> {
  if (typeof idToken !== "string" || idToken.length > 4096) throw new Error("Missing Google sign-in token.");
  const [headerPart, payloadPart, signaturePart, extra] = idToken.split(".");
  if (!headerPart || !payloadPart || !signaturePart || extra !== undefined) throw new Error("Malformed Google sign-in token.");

  const header = decodeSegment<{ alg?: string; kid?: string }>(headerPart);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Google sign-in token.");

  let jwk = (await googleKeys()).find((key) => key.kid === header.kid);
  // Google rotates keys; a new kid means our cached set is stale.
  if (!jwk) jwk = (await googleKeys(true)).find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Unknown Google signing key.");

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerPart}.${payloadPart}`);
  const signatureValid = verifier.verify(
    createPublicKey({ key: jwk, format: "jwk" }),
    Buffer.from(signaturePart, "base64url"),
  );
  if (!signatureValid) throw new Error("Google sign-in token signature is invalid.");

  const claims = decodeSegment<Record<string, unknown>>(payloadPart);
  const now = Math.floor(Date.now() / 1000);
  const audiences = allowedAudiences();
  if (!audiences.length) throw new Error("Google sign-in is not configured.");
  if (typeof claims.iss !== "string" || !ISSUERS.has(claims.iss)) throw new Error("Google sign-in token issuer is invalid.");
  if (typeof claims.aud !== "string" || !audiences.includes(claims.aud)) throw new Error("Google sign-in token audience is invalid.");
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < now) throw new Error("Google sign-in token has expired.");
  if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_SECONDS > now) throw new Error("Google sign-in token is not valid yet.");

  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (typeof claims.sub !== "string" || !claims.sub || !email) throw new Error("Google did not return an email address.");
  if (claims.email_verified !== true && claims.email_verified !== "true") {
    throw new Error("Google has not verified this email address.");
  }

  return {
    subject: claims.sub,
    email,
    name: typeof claims.name === "string" ? claims.name.trim() : "",
    givenName: typeof claims.given_name === "string" ? claims.given_name.trim() : "",
    familyName: typeof claims.family_name === "string" ? claims.family_name.trim() : "",
    picture: typeof claims.picture === "string" ? claims.picture : "",
  };
}
