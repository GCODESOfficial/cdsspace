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
import { createHash } from "crypto";
import nodemailer from "nodemailer";
import { createResendHttpTransport } from "@/lib/resend-transport";
import { createGmailApiTransport, gmailApiCredsFromEnv, verifyGmailApi } from "@/lib/gmail-api-transport";
import { EMAIL_LOGO_CID, emailLogoAttachment } from "@/lib/email-logo";
import { glashQuery } from "@/lib/glashdb/postgres";

declare global {
  // Reuse a warm HTTPS/SMTP transport for one-off transactional messages.
  // Batch callers still create and own their explicit transport.
  var cdsImmediateEmailTransport: ReturnType<typeof createEmailTransport> | undefined;
  var cdsImmediateEmailTransportMode: "gmail_api" | "resend" | "smtp" | undefined;
}

export const EMAIL_FROM = process.env.EMAIL_FROM || "support@cdsspace.pro";

/** Build a From header with a display name, e.g. `"CDS Space" <support@cdsspace.pro>`. */
export function emailFrom(displayName: string): string {
  return `"${displayName}" <${EMAIL_FROM}>`;
}

/**
 * Stable Message-ID root for a recipient + notification category. Every email
 * that sets this as its `references`/`inReplyTo` threads into one conversation
 * for that recipient (e.g. their rolling "Taskboard" thread).
 */
export function notificationThreadRoot(recipientEmail: string, category: string): string {
  const hash = createHash("sha1").update(`${recipientEmail.toLowerCase()}|${category}`).digest("hex").slice(0, 16);
  return `<cds-${category}-${hash}@cdsspace.pro>`;
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
   * Message threading. Every email sharing the same `references`/`inReplyTo`
   * root groups into ONE conversation in the recipient's inbox (e.g. all
   * Taskboard notifications), while each stays a distinct, timestamped message.
   */
  messageId?: string;
  references?: string | string[];
  inReplyTo?: string;
  /** Override the Date header - e.g. to reflect the original event time on a resend. */
  date?: Date;
  /**
   * Queue this detailed message for delivery in a stable per-recipient inbox
   * conversation. Every event remains a separate email; the worker adds the
   * standard threading headers. Set EMAIL_NOTIFICATION_QUEUE=off to bypass the
   * queue (EMAIL_DIGEST=off remains supported for older deployments).
   */
  threadCategory?: string;
  /** @deprecated Use threadCategory. */
  digestCategory?: string;
}

/** Active transport, in priority order: Gmail HTTPS API → Resend HTTPS → Gmail SMTP. */
export const EMAIL_MODE: "gmail_api" | "resend" | "smtp" = gmailApiCredsFromEnv()
  ? "gmail_api"
  : process.env.RESEND_API_KEY
    ? "resend"
    : "smtp";

type EmailMode = typeof EMAIL_MODE;

function configuredEmailModes(): EmailMode[] {
  const modes: EmailMode[] = [];
  if (gmailApiCredsFromEnv()) modes.push("gmail_api");
  if (process.env.RESEND_API_KEY) modes.push("resend");
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) modes.push("smtp");
  return modes;
}

function createTransportForMode(mode: EmailMode) {
  if (mode === "gmail_api") {
    const credentials = gmailApiCredsFromEnv();
    if (!credentials) throw new Error("Gmail API email is not configured.");
    return createGmailApiTransport(credentials);
  }
  if (mode === "resend") {
    if (!process.env.RESEND_API_KEY) throw new Error("Resend email is not configured.");
    return createResendHttpTransport(process.env.RESEND_API_KEY);
  }

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

function emailErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "unknown email delivery error";
}

/**
 * Send one email through nodemailer. The transport chosen by
 * `createEmailTransport()` is HTTPS (Resend) when RESEND_API_KEY is set, or
 * Gmail SMTP otherwise. Either way the From address is EMAIL_FROM.
 */
/**
 * A send must fail rather than hang.
 *
 * A host that blocks outbound SMTP does not refuse the connection, it simply
 * never answers, so a send could hold a request open until the platform killed
 * it. One stalled send then ties up a worker; many of them take the site down.
 */
const EMAIL_SEND_TIMEOUT_MS = Number(process.env.EMAIL_SEND_TIMEOUT_MS || 12_000);

/**
 * How many sends may be in flight at once. Notifications can arrive in bursts
 * (an announcement, a busy thread), and without a ceiling each one opens its
 * own connection, so a slow provider turns a burst into hundreds of waiting
 * sockets on one server.
 */
const EMAIL_MAX_IN_FLIGHT = Number(process.env.EMAIL_MAX_IN_FLIGHT || 4);
let emailInFlight = 0;
const emailQueue: Array<() => void> = [];

async function withSendSlot<T>(run: () => Promise<T>): Promise<T> {
  if (emailInFlight >= EMAIL_MAX_IN_FLIGHT) {
    await new Promise<void>((resolve) => emailQueue.push(resolve));
  }
  emailInFlight += 1;
  try {
    return await run();
  } finally {
    emailInFlight -= 1;
    emailQueue.shift()?.();
  }
}

function withSendTimeout<T>(pending: Promise<T>): Promise<T> {
  return Promise.race([
    pending,
    new Promise<T>((_resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Email send timed out after ${EMAIL_SEND_TIMEOUT_MS}ms`)),
        EMAIL_SEND_TIMEOUT_MS,
      );
      // Never keep the process alive just for this timer.
      if (typeof timer.unref === "function") timer.unref();
    }),
  ]);
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const threadCategory = input.threadCategory || input.digestCategory;
  // Immediate delivery is the default. The durable queue remains available as
  // an explicit operational choice, but ordinary user-facing messages no
  // longer wait for a later digest/cron worker.
  const queueEnabled = process.env.EMAIL_NOTIFICATION_QUEUE === "on";

  // Threaded notifications are queued so each event can be delivered and
  // retried independently while retaining its full template and action button.
  if (threadCategory && queueEnabled) {
    try {
      const lines = (input.text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const detectedLink = (input.text?.match(/https?:\/\/[^\s<>]+/) || [])[0]?.replace(/[),.;]+$/, "") || null;
      const summary = lines.find((line) => line !== input.subject && line !== detectedLink) || null;
      await glashQuery(
        `insert into public.notification_email_queue
           (recipient_email, category, subject, title, body, link, html, text_body, from_name)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          input.to,
          threadCategory,
          input.subject,
          input.subject,
          summary,
          detectedLink,
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
  // Attach the branded logo inline only when the html references its cid (i.e.
  // it went through brandedEmailHtml), so plain emails stay lightweight.
  const attachments = [
    ...(input.html?.includes(`cid:${EMAIL_LOGO_CID}`) ? [emailLogoAttachment()] : []),
    ...(input.attachments || []),
  ];
  const mail = {
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
    attachments: attachments.length ? attachments : undefined,
    messageId: input.messageId,
    references: input.references,
    inReplyTo: input.inReplyTo,
    date: input.date,
  };

  // Batch callers explicitly own their transport and its lifecycle. Preserve
  // that behaviour rather than retrying through an unrelated provider.
  if (input.transporter) {
    await withSendSlot(() => withSendTimeout(input.transporter!.sendMail(mail)));
    return;
  }

  const configuredModes = configuredEmailModes();
  if (!configuredModes.length) {
    throw new Error("Email is not configured.");
  }

  // A Gmail refresh token can expire or lose its send scope, and a provider
  // can have a temporary outage. Transactional mail must not become a
  // single-provider failure: try every independently configured channel in a
  // deterministic order, while keeping the last successful transport warm.
  const cachedMode = globalThis.cdsImmediateEmailTransportMode;
  const modes = cachedMode && configuredModes.includes(cachedMode)
    ? [cachedMode, ...configuredModes.filter((mode) => mode !== cachedMode)]
    : configuredModes;
  const failures: string[] = [];

  for (const mode of modes) {
    const isCached = mode === globalThis.cdsImmediateEmailTransportMode
      && !!globalThis.cdsImmediateEmailTransport;
    const transporter = isCached
      ? globalThis.cdsImmediateEmailTransport!
      : createTransportForMode(mode);
    try {
      await withSendSlot(() => withSendTimeout(transporter.sendMail(mail)));
      globalThis.cdsImmediateEmailTransport = transporter;
      globalThis.cdsImmediateEmailTransportMode = mode;
      return;
    } catch (error) {
      failures.push(`${mode}: ${emailErrorMessage(error)}`);
      console.error(`[email] ${mode} delivery failed; trying the next configured transport.`, error);
      if (isCached) {
        globalThis.cdsImmediateEmailTransport = undefined;
        globalThis.cdsImmediateEmailTransportMode = undefined;
      }
      try {
        transporter.close();
      } catch {
        // Custom HTTPS transports do not always expose a meaningful close.
      }
    }
  }

  throw new Error(`Email delivery failed through every configured transport (${failures.join("; ")}).`);
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
  if (transporter) {
    const gmail = gmailApiCredsFromEnv();
    if (EMAIL_MODE === "gmail_api" && gmail) return verifyGmailApi(gmail);
    if (EMAIL_MODE === "resend") return null;
    try {
      await transporter.verify();
      return null;
    } catch (e) {
      return `Email server connection failed: ${e instanceof Error ? e.message : "unknown error"}`;
    }
  }

  const failures: string[] = [];
  const gmail = gmailApiCredsFromEnv();
  if (gmail) {
    const error = await verifyGmailApi(gmail);
    if (!error) return null;
    failures.push(error);
  }
  // Resend's send-only API keys cannot be verified with the account/domain
  // endpoints. Presence is enough here; sendEmail performs real failover if
  // the provider rejects the subsequent message.
  if (process.env.RESEND_API_KEY) return null;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    if (failures.length) return failures.join(" ");
    return "Email is not configured (set GMAIL_REFRESH_TOKEN, RESEND_API_KEY, or EMAIL_USER/EMAIL_PASS).";
  }
  const t = createTransportForMode("smtp");
  try {
    await t.verify();
    return null;
  } catch (e) {
    failures.push(`Email server connection failed: ${e instanceof Error ? e.message : "unknown error"}`);
    return failures.join(" ");
  } finally {
    t.close();
  }
}
