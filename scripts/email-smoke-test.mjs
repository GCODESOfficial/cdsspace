/**
 * Email smoke test - sends one real email using the same transport the app
 * uses, so you can confirm delivery works end to end.
 *
 * Picks transport by env (same priority as the app):
 *   1. Gmail HTTPS API   (GMAIL_REFRESH_TOKEN + GOOGLE_CLIENT_ID/SECRET)
 *   2. Resend HTTPS API  (RESEND_API_KEY)
 *
 * Usage:  node scripts/email-smoke-test.mjs [recipient@example.com]
 * Default recipient: NEXT_PUBLIC_ADMIN_EMAIL from .env.
 */
import { readFileSync } from "node:fs";

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  } catch {
    /* no .env */
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };
const from = env.EMAIL_FROM || "support@cdsspace.pro";
const fromHeader = `"CDS Space" <${from}>`;
const to = process.argv[2] || env.NEXT_PUBLIC_ADMIN_EMAIL || from;
const subject = "CDS Space email smoke test";
const siteUrl = (env.NEXT_PUBLIC_SITE_URL || "https://cdsspace.pro").replace(/\/$/, "");
const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e6eaf2;border-radius:16px;overflow:hidden;">
      <tr><td align="center" style="padding:28px 24px 8px;">
        <img src="${siteUrl}/favicon.png" width="56" height="56" alt="CDS Space" style="display:block;border-radius:14px;" />
        <div style="margin-top:12px;font-size:18px;font-weight:800;color:#0D1B39;">CDS Space</div>
      </td></tr>
      <tr><td style="padding:12px 28px 28px;font-size:15px;line-height:1.6;color:#374151;">
        This is a smoke test confirming <b>CDS Space</b> email delivery is working, with the branded logo header.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
const text = "This is a smoke test confirming CDS Space email delivery is working.";

async function viaGmailApi() {
  const clientId = env.GMAIL_CLIENT_ID || env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GMAIL_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET;
  const refreshToken = env.GMAIL_REFRESH_TOKEN;
  console.log(`→ Sending via Gmail HTTPS API\n  from: ${fromHeader}\n  to:   ${to}`);

  const tokRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const tok = await tokRes.json().catch(() => null);
  if (!tokRes.ok || !tok?.access_token) {
    console.error(`✗ Could not get access token: ${tok?.error_description || tok?.error || tokRes.status}`);
    process.exit(1);
  }

  const mime = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ].join("\r\n");
  const raw = Buffer.from(mime).toString("base64url");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  const body = await res.json().catch(() => null);
  if (res.ok) {
    console.log(`✓ Sent via Gmail API. id: ${body?.id ?? "(none)"} - check the ${to} inbox.`);
    process.exit(0);
  }
  console.error(`✗ Gmail API failed (HTTP ${res.status}): ${body?.error?.message || JSON.stringify(body)}`);
  process.exit(1);
}

async function viaResend() {
  console.log(`→ Sending via Resend\n  from: ${fromHeader}\n  to:   ${to}`);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromHeader, to, subject, text, html }),
  });
  const body = await res.json().catch(() => null);
  if (res.ok) {
    console.log(`✓ Sent via Resend. id: ${body?.id ?? "(none)"} - check the ${to} inbox.`);
    process.exit(0);
  }
  console.error(`✗ Resend failed (HTTP ${res.status}): ${body?.message || body?.error?.message || JSON.stringify(body)}`);
  process.exit(1);
}

if (env.GMAIL_REFRESH_TOKEN && (env.GMAIL_CLIENT_ID || env.GOOGLE_CLIENT_ID) && (env.GMAIL_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET)) {
  await viaGmailApi();
} else if (env.RESEND_API_KEY?.startsWith("re_")) {
  await viaResend();
} else {
  console.error("✗ No HTTPS mail transport configured. Set GMAIL_REFRESH_TOKEN (run scripts/gmail-oauth-setup.mjs) or RESEND_API_KEY in .env.");
  process.exit(1);
}
