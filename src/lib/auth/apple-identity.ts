import "server-only";

import { createHash, createPublicKey, verify as verifySignature, type JsonWebKey } from "node:crypto";

/**
 * Verify a Sign in with Apple identity token from the iPhone app.
 * The app signs in natively (no browser), receives Apple's signed JWT and sends
 * it here with the raw nonce it generated. We check Apple's RS256 signature
 * against Apple's published keys, the issuer, the audience (this app's bundle
 * ID), expiry, and that the token's nonce is the SHA-256 of the raw nonce so a
 * captured token cannot be replayed.
 */

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
const KEY_CACHE_MS = 6 * 60 * 60 * 1000;

let keyCache: { at: number; keys: Array<JsonWebKey & { kid?: string; alg?: string }> } | null = null;

async function appleKeys(forceRefresh = false) {
  if (!forceRefresh && keyCache && Date.now() - keyCache.at < KEY_CACHE_MS) return keyCache.keys;
  const response = await fetch(APPLE_KEYS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Apple sign-in keys are unavailable.");
  const body = (await response.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
  keyCache = { at: Date.now(), keys: body.keys || [] };
  return keyCache.keys;
}

/**
 * Bundle IDs whose Apple tokens this server accepts: APPLE_CLIENT_IDS
 * (comma-separated), defaulting to the CDS Space app. Expo Go's own bundle ID is
 * accepted only outside production, for development.
 */
function allowedAudiences() {
  const configured = (process.env.APPLE_CLIENT_IDS || "pro.cdsspace.app")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return process.env.NODE_ENV === "production" ? configured : [...configured, "host.exp.Exponent"];
}

const decodePart = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

export type AppleIdentity = { subject: string; email: string; emailVerified: boolean; privateRelay: boolean };

export async function verifyAppleIdentityToken(token: unknown, rawNonce: unknown): Promise<AppleIdentity> {
  if (typeof token !== "string" || token.length > 4096 || typeof rawNonce !== "string" || rawNonce.length < 16 || rawNonce.length > 200) {
    throw new Error("Apple sign-in was incomplete.");
  }
  const [headerPart, payloadPart, signaturePart, extra] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart || extra) throw new Error("Apple sign-in was incomplete.");

  const header = decodePart(headerPart) as { kid?: string; alg?: string };
  if (header.alg !== "RS256" || !header.kid) throw new Error("Apple sign-in could not be verified.");
  let jwk = (await appleKeys()).find((key) => key.kid === header.kid);
  if (!jwk) jwk = (await appleKeys(true)).find((key) => key.kid === header.kid); // Apple rotated its keys
  if (!jwk) throw new Error("Apple sign-in could not be verified.");

  const signedOk = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${headerPart}.${payloadPart}`),
    createPublicKey({ key: jwk, format: "jwk" }),
    Buffer.from(signaturePart, "base64url"),
  );
  if (!signedOk) throw new Error("Apple sign-in could not be verified.");

  const claims = decodePart(payloadPart) as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  const expectedNonce = createHash("sha256").update(rawNonce).digest("hex");
  if (
    claims.iss !== APPLE_ISSUER ||
    typeof claims.aud !== "string" ||
    !allowedAudiences().includes(claims.aud) ||
    typeof claims.exp !== "number" ||
    claims.exp <= now ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    claims.nonce !== expectedNonce
  ) {
    throw new Error("Apple sign-in could not be verified.");
  }

  return {
    subject: claims.sub,
    email: typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "",
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    privateRelay: claims.is_private_email === true || claims.is_private_email === "true",
  };
}
