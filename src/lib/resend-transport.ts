/**
 * A nodemailer transport that delivers over Resend's HTTPS API (port 443)
 * instead of an SMTP socket.
 *
 * Why: some hosts (e.g. GlashDB app hosting) block all outbound SMTP, so
 * nodemailer's normal SMTP transport times out. This custom transport keeps the
 * exact nodemailer interface - `transporter.sendMail({ from, to, subject, html,
 * text })` - but sends the message as an HTTPS request, which is never blocked.
 * Every existing nodemailer call site works unchanged; only the wire protocol
 * changes from SMTP to HTTPS.
 *
 * It reads the structured fields nodemailer already collected (mail.data), so
 * no raw-MIME handling is needed - Resend's /emails endpoint is JSON.
 */
import nodemailer from "nodemailer";

/** Normalise a nodemailer address value to a single "Name <email>" string. */
function toAddress(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(toAddress).filter(Boolean).join(", ");
  const o = value as { name?: string; address?: string };
  if (o.address) return o.name ? `"${o.name}" <${o.address}>` : o.address;
  return "";
}

/** Normalise a nodemailer recipient value to an array of address strings. */
function toList(value: unknown): string[] {
  const s = toAddress(value);
  return s ? s.split(",").map((x) => x.trim()).filter(Boolean) : [];
}

/**
 * Build a nodemailer Transporter backed by Resend HTTPS. Returns the same
 * Transporter type as `nodemailer.createTransport`, so it's a drop-in.
 */
export function createResendHttpTransport(apiKey: string) {
  // A nodemailer custom transport plugin: { name, version, send }.
  const plugin = {
    name: "resend-http",
    version: "1.0.0",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    send(mail: any, callback: (err: Error | null, info?: unknown) => void) {
      const d = mail?.data ?? {};
      const to = toList(d.to);
      const payload: Record<string, unknown> = {
        from: toAddress(d.from),
        to,
        subject: d.subject || "",
      };
      const cc = toList(d.cc);
      if (cc.length) payload.cc = cc;
      const bcc = toList(d.bcc);
      if (bcc.length) payload.bcc = bcc;
      const replyTo = toAddress(d.replyTo);
      if (replyTo) payload.reply_to = replyTo;
      if (typeof d.html === "string") payload.html = d.html;
      if (typeof d.text === "string") payload.text = d.text;

      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(async (res) => {
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            callback(
              new Error(body?.message || body?.error?.message || body?.error || `Resend responded ${res.status}`),
            );
            return;
          }
          callback(null, {
            messageId: body?.id || `<${Date.now()}@resend>`,
            accepted: to,
            rejected: [],
            response: `Resend accepted${body?.id ? ` (${body.id})` : ""}`,
            envelope: { from: payload.from, to },
          });
        })
        .catch((e) => callback(e instanceof Error ? e : new Error(String(e))));
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return nodemailer.createTransport(plugin as any);
}
