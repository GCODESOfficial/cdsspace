/**
 * A nodemailer transport that delivers through the Gmail HTTPS API instead of
 * an SMTP socket - so it works on hosts that block outbound SMTP (GlashDB app
 * hosting) while still sending from your own Gmail account (no third party).
 *
 * How it works: nodemailer builds the full MIME message exactly as it would for
 * SMTP; this transport base64url-encodes that MIME and POSTs it to
 *   https://gmail.googleapis.com/gmail/v1/users/me/messages/send   (port 443)
 * authenticated with an OAuth2 access token minted from a long-lived refresh
 * token. Every `transporter.sendMail({ from, to, subject, html })` call works
 * unchanged; only the wire protocol changes from SMTP to HTTPS.
 *
 * The From header stays support@cdsspace.pro (a verified "send mail as" alias
 * on the account), same as the SMTP alias behaviour.
 *
 * Env:
 *   GMAIL_CLIENT_ID     (falls back to GOOGLE_CLIENT_ID)
 *   GMAIL_CLIENT_SECRET (falls back to GOOGLE_CLIENT_SECRET)
 *   GMAIL_REFRESH_TOKEN (obtained once via scripts/gmail-oauth-setup.mjs)
 */
import nodemailer from "nodemailer";

export interface GmailApiCreds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/** Read Gmail API creds from env, or null if not fully configured. */
export function gmailApiCredsFromEnv(): GmailApiCreds | null {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

// Cache the short-lived access token across sends within a warm instance.
let tokenCache: { token: string; expiresAt: number } = { token: "", expiresAt: 0 };

/** Exchange the refresh token for a fresh access token (cached until near expiry). */
export async function getGmailAccessToken(creds: GmailApiCreds): Promise<string> {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 30_000) return tokenCache.token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error?: string; error_description?: string }
    | null;
  if (!res.ok || !body?.access_token) {
    throw new Error(body?.error_description || body?.error || `Google token endpoint responded ${res.status}`);
  }
  tokenCache = { token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

/** Validate the refresh token can mint an access token. Returns null or an error string. */
export async function verifyGmailApi(creds: GmailApiCreds): Promise<string | null> {
  try {
    await getGmailAccessToken(creds);
    return null;
  } catch (e) {
    return `Gmail API auth failed: ${e instanceof Error ? e.message : "unknown error"}`;
  }
}

/** Build a nodemailer Transporter that sends via the Gmail HTTPS API. */
export function createGmailApiTransport(creds: GmailApiCreds) {
  const plugin = {
    name: "gmail-api",
    version: "1.0.0",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    send(mail: any, callback: (err: Error | null, info?: unknown) => void) {
      // nodemailer has already assembled the MIME message on mail.message.
      mail.message.build(async (err: Error | null, raw: Buffer) => {
        if (err) return callback(err);
        try {
          const token = await getGmailAccessToken(creds);
          const res = await fetch(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ raw: raw.toString("base64url") }),
            },
          );
          const body = (await res.json().catch(() => null)) as
            | { id?: string; error?: { message?: string } }
            | null;
          if (!res.ok) {
            callback(new Error(body?.error?.message || `Gmail API responded ${res.status}`));
            return;
          }
          const envelope = mail.message.getEnvelope();
          callback(null, {
            messageId: body?.id || mail.message.messageId(),
            envelope,
            accepted: envelope?.to ?? [],
            rejected: [],
            response: `Gmail API accepted${body?.id ? ` (${body.id})` : ""}`,
          });
        } catch (e) {
          callback(e instanceof Error ? e : new Error(String(e)));
        }
      });
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return nodemailer.createTransport(plugin as any);
}
