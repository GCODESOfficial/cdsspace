import "server-only";

import { sendEmail } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";

/**
 * Instant alerts to the desk, for the handful of things somebody must act on
 * the moment they happen: a client writes in, books a consultation, places an
 * order, asks for a quote, or finance raises an invoice.
 *
 * These are deliberately NOT queued or digested. A digest is right for a flood
 * of task updates; it is wrong for a client waiting on a reply, which is why
 * `sendEmail` is called here without a threadCategory.
 *
 * Sending never blocks or breaks the action that triggered it: a failed alert
 * is logged and swallowed, because an order must still be recorded even if the
 * mail server is down.
 */

export type AdminAlertKind =
  | "client_message"
  | "client_call"
  | "consultation"
  | "order"
  | "quote"
  | "invoice";

const KIND_COPY: Record<AdminAlertKind, { eyebrow: string; heading: string; lead: string }> = {
  client_message: {
    eyebrow: "New client message",
    heading: "A client has messaged us",
    lead: "Reply from Sales Hub chat so the conversation stays in one place.",
  },
  client_call: {
    eyebrow: "Incoming client cMeet",
    heading: "A client has started a cMeet",
    lead: "The call is live now. Join from the secure cMeet room while the client is waiting.",
  },
  consultation: {
    eyebrow: "Consultation booked",
    heading: "A consultation has been booked",
    lead: "Confirm the slot and send the meeting details before the preferred day.",
  },
  order: {
    eyebrow: "New order",
    heading: "An order has been placed",
    lead: "Acknowledge it and move it into production scheduling.",
  },
  quote: {
    eyebrow: "Quote request",
    heading: "Someone has asked for a quote",
    lead: "Price it and send the quotation while the interest is fresh.",
  },
  invoice: {
    eyebrow: "Invoice created",
    heading: "An invoice has been raised",
    lead: "Check the figures, then send it to the client.",
  },
};

/** The desk. Overridable per deployment without touching code. */
export function adminAlertRecipients(): string[] {
  return (process.env.ADMIN_ALERT_RECIPIENTS || "contact.cdsspace@gmail.com,christian.john161@gmail.com")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(entry));
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://cdsspace.pro").replace(/\/$/, "");
}

export type AdminAlertInput = {
  kind: AdminAlertKind;
  /** Who or what this is about, e.g. the client or company name. */
  subject: string;
  /** Label/value pairs shown as a table. Empty values are dropped. */
  details?: Array<[string, unknown]>;
  /** Longer free text, e.g. the message body or project brief. */
  body?: string;
  /** Where in the admin this should be handled, as a path. */
  actionPath?: string;
  actionLabel?: string;
  /** Set so a reply from the inbox reaches the client directly. */
  replyTo?: string;
};

/**
 * Sends one alert to every desk address. Returns how many went out so a caller
 * can log it, and resolves even when every send fails.
 */
export async function sendAdminAlert(input: AdminAlertInput): Promise<number> {
  const recipients = input.kind === "client_call"
    ? Array.from(new Set([
        ...adminAlertRecipients(),
        "contact.cdsspace@gmail.com",
        "christian.john161@gmail.com",
      ]))
    : adminAlertRecipients();
  if (!recipients.length) return 0;

  const copy = KIND_COPY[input.kind];
  const rows = (input.details || [])
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(([label, value]) => `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid #EEF2F9;color:#5C6C8B;font-weight:600;width:190px;vertical-align:top;font-size:14px;">${escapeHtml(label)}</td>
        <td style="padding:9px 0;border-bottom:1px solid #EEF2F9;color:#07133B;font-size:14px;">${escapeHtml(value)}</td>
      </tr>`)
    .join("");

  const action = input.actionPath
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
         <tr><td style="border-radius:10px;background:#0A4FE8;">
           <a href="${escapeHtml(`${siteUrl()}${input.actionPath}`)}" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">${escapeHtml(input.actionLabel || "Open in the dashboard")}</a>
         </td></tr>
       </table>`
    : "";

  const when = new Date().toLocaleString("en-GB", {
    timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });

  const html = brandedEmailHtml(`
    <h2 style="margin:0 0 8px;color:#07133B;font-size:20px;">${escapeHtml(copy.heading)}</h2>
    <p style="margin:0 0 4px;color:#0A4FE8;font-size:15px;font-weight:700;">${escapeHtml(input.subject)}</p>
    <p style="margin:0 0 18px;color:#5C6C8B;font-size:13px;">${escapeHtml(when)} (WAT) &middot; ${escapeHtml(copy.lead)}</p>
    ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>` : ""}
    ${input.body ? `
      <h3 style="margin:20px 0 6px;color:#07133B;font-size:15px;">In their words</h3>
      <div style="background:#F3F6FC;padding:14px;border-radius:10px;color:#1F2A44;font-size:14px;line-height:1.6;">${escapeHtml(input.body).replace(/\n/g, "<br />")}</div>`
      : ""}
    ${action}
  `, { eyebrow: copy.eyebrow, preheader: `${copy.heading}: ${input.subject}` });

  const text = [
    copy.heading,
    input.subject,
    `${when} (WAT)`,
    "",
    ...(input.details || [])
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
      .map(([label, value]) => `${label}: ${value}`),
    input.body ? `\n${input.body}` : "",
    input.actionPath ? `\n${siteUrl()}${input.actionPath}` : "",
  ].filter(Boolean).join("\n");

  const results = await Promise.allSettled(
    recipients.map((to) => sendEmail({
      to,
      subject: `${copy.eyebrow}: ${input.subject}`,
      html,
      text,
      fromName: "CDS Space Alerts",
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    })),
  );

  const sent = results.filter((result) => result.status === "fulfilled").length;
  if (sent < recipients.length) {
    console.error(`[admin-alert] ${input.kind}: ${recipients.length - sent} of ${recipients.length} recipient(s) failed`);
  }
  return sent;
}

/**
 * Fire-and-forget wrapper. Use at the end of a request handler so the alert
 * never delays the response or fails the action it is reporting on.
 */
export function queueAdminAlert(input: AdminAlertInput): void {
  void sendAdminAlert(input).catch((error) => {
    console.error(`[admin-alert] ${input.kind} failed`, error);
  });
}
