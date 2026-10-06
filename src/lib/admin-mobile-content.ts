import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

/**
 * Content Hub "connect a social channel" from the mobile app.
 *
 * The platform's OAuth must come back to the already-registered web callback
 * (/api/admin/content-hub/social/callback/[platform]), which needs the admin
 * session cookie and the social_oauth_state cookie in the browser that signs in.
 * The app's sign-in sheet has neither, so the app asks for a short-lived ticket
 * (POST .../social/start, with its admin bearer) and opens .../social/open?t=…,
 * which puts those two cookies in the sheet - the admin cookie only for the
 * callback path and for ten minutes - and continues to the platform's sign-in.
 *
 * Tickets are signed with a key derived for this purpose only, so a ticket can
 * never be presented as an admin_session cookie. Each carries a random id (jti),
 * is bound to the platform it was issued for, expires after two minutes, and is
 * burned on first use by the open route (consumeSocialTicket), so a copied link
 * cannot be replayed. Tickets are never logged.
 */
const SECRET = process.env.ADMIN_SESSION_SECRET || process.env.GLASHDB_SERVICE_ROLE_KEY || "";
const TICKET_TTL_MS = 2 * 60 * 1000;

export interface SocialConnectTicket {
  jti: string;
  platform: string;
  state: string;
  adminCookie: string;
  exp: number;
}

function key() {
  return createHmac("sha256", SECRET).update("cds-mobile-content-social-connect:v1").digest();
}

export function signSocialTicket(input: Omit<SocialConnectTicket, "exp" | "jti">): string | null {
  if (!SECRET) return null;
  const payload = Buffer.from(JSON.stringify({ ...input, jti: randomUUID(), exp: Date.now() + TICKET_TTL_MS })).toString("base64url");
  const sig = createHmac("sha256", key()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySocialTicket(raw: string | null | undefined): SocialConnectTicket | null {
  if (!raw || !SECRET) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = raw.slice(0, dot);
  const expected = Buffer.from(createHmac("sha256", key()).update(payload).digest("base64url"));
  const given = Buffer.from(raw.slice(dot + 1));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const ticket = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SocialConnectTicket;
    if (!ticket || typeof ticket.exp !== "number" || ticket.exp < Date.now()) return null;
    if (!ticket.jti || !ticket.platform || !ticket.state || !ticket.adminCookie) return null;
    return ticket;
  } catch {
    return null;
  }
}

/**
 * Burns a ticket id. Resolves to true only the first time an id is presented
 * (security_rate_limits with limit 1; the window outlives the ticket's expiry).
 */
export async function consumeSocialTicket(jti: string): Promise<boolean> {
  const { consumeSecurityRateLimit } = await import("@/lib/client-login-security");
  const limited = await consumeSecurityRateLimit({
    bucket: "admin-social-ticket",
    identifier: jti,
    limit: 1,
    windowSeconds: 300,
    blockSeconds: 300,
  });
  return !limited;
}
