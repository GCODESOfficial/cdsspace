/**
 * Single source of truth for outgoing email - sender address + nodemailer transport.
 *
 * SMTP authenticates with the linked Gmail account
 * (EMAIL_USER / EMAIL_PASS = contact.cdsspace@gmail.com + Gmail App Password),
 * but mail is sent AS the branded alias support@cdsspace.pro so recipients never
 * see the raw @gmail.com address. Override with EMAIL_FROM if it ever changes.
 *
 * IMPORTANT: support@cdsspace.pro must be added and verified as a
 * "Send mail as" address inside the contact.cdsspace@gmail.com account,
 * otherwise Gmail rewrites the From header back to the authenticated account.
 *
 * HOSTING / SMTP BLOCK: some hosts (GlashDB app hosting) block all outbound
 * SMTP, so the SMTP transport times out. Set RESEND_API_KEY and
 * `createEmailTransport()` returns a nodemailer transport that delivers over
 * Resend's HTTPS API (port 443) instead - same sendMail interface, no SMTP.
 * With no key it falls back to Gmail SMTP (local dev / SMTP-allowed hosts).
 */
import nodemailer from "nodemailer";
import { createResendHttpTransport } from "@/lib/resend-transport";
import { createGmailApiTransport, gmailApiCredsFromEnv, verifyGmailApi } from "@/lib/gmail-api-transport";
import { EMAIL_LOGO_CID, emailLogoAttachment } from "@/lib/email-logo";
import { glashQuery } from "@/lib/glashdb/postgres";

export const EMAIL_FROM = process.env.EMAIL_FROM || "support@cdsspace.pro";

/** Build a From header with a display name, e.g. `"CDS Space" <support@cdsspace.pro>`. */
export function emailFrom(displayName: string): string {
  return `"${displayName}" <${EMAIL_FROM}>`;
}

/**
 * Gmail transport authenticated by the linked account (EMAIL_USER/EMAIL_PASS).
 *
 * The explicit timeouts matter on serverless hosts: without them a blocked/slow
 * SMTP handshake makes `sendMail` hang until the platform kills the function and
 * returns a non-JSON error body. With them, a stalled send throws a catchable
 * error in a few seconds so the route can respond cleanly.
 */
export function createEmailTransport() {
  // Preferred: send through your own Gmail over the Gmail HTTPS API. Still a
  // nodemailer transport (same sendMail API), but port 443 instead of an SMTP
  // socket, so it works on hosts that block outbound SMTP - no third party.
  const gmail = gmailApiCredsFromEnv();
  if (gmail) return createGmailApiTransport(gmail);

  // Alternative HTTPS path: Resend, if a key is set.
  if (process.env.RESEND_API_KEY) {
    return createResendHttpTransport(process.env.RESEND_API_KEY);
  }

  // Fallback: real Gmail SMTP (for local dev / hosts that allow SMTP egress).
  // Default to smtp.gmail.com:587 (STARTTLS); overridable via env.
  const port = Number(process.env.EMAIL_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port,
    secure: process.env.EMAIL_SECURE ? process.env.EMAIL_SECURE === "true" : port === 465,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  /** Display name for the From header; the address is always EMAIL_FROM. */
  fromName?: string;
  replyTo?: string;
  /** Reuse an open transport across a batch instead of opening one per email. */
  transporter?: ReturnType<typeof createEmailTransport>;
  /** Optional inline or downloadable attachments supplied by the caller. */
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
    cid?: string;
  }>;
  /**
   * When set, this email is a repetitive notification that should be COMPOUNDED
   * rather than sent immediately. It is queued and the notification-digest cron
   * groups all items of the same category per recipient into one email. Set
   * EMAIL_DIGEST=off to disable and send everything immediately.
   */
  digestCategory?: string;
}

/** Active transport, in priority order: Gmail HTTPS API → Resend HTTPS → Gmail SMTP. */
export const EMAIL_MODE: "gmail_api" | "resend" | "smtp" = gmailApiCredsFromEnv()
  ? "gmail_api"
  : process.env.RESEND_API_KEY
    ? "resend"
    : "smtp";

/**
 * Send one email through nodemailer. The transport chosen by
 * `createEmailTransport()` is HTTPS (Resend) when RESEND_API_KEY is set, or
 * Gmail SMTP otherwise. Either way the From address is EMAIL_FROM.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  // Compoundable notifications are queued; the digest cron sends a grouped email.
  if (input.digestCategory && process.env.EMAIL_DIGEST !== "off") {
    try {
      await glashQuery(
        `insert into public.notification_email_queue
           (recipient_email, category, subject, title, body, link, html, text_body, from_name)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          input.to,
          input.digestCategory,
          input.subject,
          input.subject,
          input.text?.split("\n")[1] || null,
          (input.text?.match(/https?:\/\/\S+/) || [])[0] || null,
          input.html || null,
          input.text || null,
          input.fromName || "CDS Space",
        ],
      );
      return;
    } catch (error) {
      // If queueing fails, fall through and send immediately - never lose a notice.
      console.error("[email-digest] queue failed, sending immediately:", error);
    }
  }

  const from = emailFrom(input.fromName || "CDS Space");
  const transporter = input.transporter ?? createEmailTransport();
  // Attach the branded logo inline only when the html references its cid (i.e.
  // it went through brandedEmailHtml), so plain emails stay lightweight.
  const attachments = [
    ...(input.html?.includes(`cid:${EMAIL_LOGO_CID}`) ? [emailLogoAttachment()] : []),
    ...(input.attachments || []),
  ];
  try {
    await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      attachments: attachments.length ? attachments : undefined,
    });
  } finally {
    // Only close transports we created here; leave a shared/batch one open.
    if (!input.transporter) transporter.close();
  }
}

/**
 * Confirm the transport is usable before a bulk send, so failures return a
 * clear message instead of hanging. Resend: just needs the key. SMTP: verify
 * the connection/credentials (pass a transporter to verify + reuse it).
 * Returns null when OK, or an error string.
 */
export async function verifyEmailReady(
  transporter?: ReturnType<typeof createEmailTransport>,
): Promise<string | null> {
  const gmail = gmailApiCredsFromEnv();
  if (gmail) return verifyGmailApi(gmail);
  if (process.env.RESEND_API_KEY) return null;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return "Email is not configured (set GMAIL_REFRESH_TOKEN, RESEND_API_KEY, or EMAIL_USER/EMAIL_PASS).";
  }
  const t = transporter ?? createEmailTransport();
  try {
    await t.verify();
    return null;
  } catch (e) {
    return `Email server connection failed: ${e instanceof Error ? e.message : "unknown error"}`;
  } finally {
    if (!transporter) t.close();
  }
}
