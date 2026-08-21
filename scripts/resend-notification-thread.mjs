/**
 * Explicitly resend every already-delivered notification created on one Lagos
 * calendar date. Each queue item remains its own detailed email and receives a
 * fresh Message-ID, while category headers keep related messages in one inbox
 * conversation.
 *
 * Dry run:
 *   node scripts/resend-notification-thread.mjs --date=YYYY-MM-DD
 * Send:
 *   node scripts/resend-notification-thread.mjs --date=YYYY-MM-DD --execute
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import pg from "pg";

dotenv.config({ path: ".env" });

const execute = process.argv.includes("--execute");
const dateArg = process.argv.find((arg) => arg.startsWith("--date="))?.slice("--date=".length);
if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
  throw new Error("Pass a Lagos calendar date as --date=YYYY-MM-DD.");
}

const connectionString = process.env.GLASHDB_DIRECT_URL
  || process.env.DIRECT_URL
  || process.env.GLASHDB_DATABASE_URL
  || process.env.DATABASE_URL;
if (!connectionString) throw new Error("No database URL is configured.");

const CATEGORY_SUBJECT = {
  tasks: "Taskboard",
  chat: "Messages",
  deliveries: "Deliveries",
  content: "Content updates",
  finance: "Finance",
  consultations: "Consultations",
  projects: "Projects",
  orders: "Orders",
  clients: "Clients",
  mailings: "Client mailings",
  system: "CDS Space updates",
};

function threadRoot(recipientEmail, category) {
  const hash = createHash("sha1")
    .update(`${recipientEmail.toLowerCase()}|${category}`)
    .digest("hex")
    .slice(0, 16);
  return `<cds-${category}-${hash}@cdsspace.pro>`;
}

function emailLogoAttachment() {
  const source = readFileSync("src/lib/email-logo.ts", "utf8");
  const base64 = source.match(/EMAIL_LOGO_PNG_BASE64\s*=\s*\n?\s*"([^"]+)"/)?.[1];
  if (!base64) throw new Error("Could not load the inline CDS Space email logo.");
  return {
    filename: "cds-space.png",
    content: Buffer.from(base64, "base64"),
    cid: "cdslogo@cdsspace",
    contentType: "image/png",
  };
}

async function withRetry(operation, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
      }
    }
  }
  throw lastError;
}

const db = new pg.Client({ connectionString });
await db.connect();

let transporter;
try {
  const result = await db.query(
    `select id::text, recipient_email, category, subject, html, text_body,
            link, created_at, delivery_version, resend_count
       from public.notification_email_queue
      where (created_at at time zone 'Africa/Lagos')::date = $1::date
        and sent_at is not null
        and resend_count = 0
      order by recipient_email, category, created_at, id`,
    [dateArg],
  );
  const rows = result.rows;
  const summary = {
    date_lagos: dateArg,
    notifications: rows.length,
    recipients: new Set(rows.map((row) => row.recipient_email.toLowerCase())).size,
    categories: [...new Set(rows.map((row) => row.category))].sort(),
    detailed_templates: rows.filter((row) => row.html && row.text_body).length,
    action_links: rows.filter((row) => row.link && /<a[^>]+href=/i.test(row.html || "")).length,
  };
  console.log(summary);

  if (!rows.length) throw new Error("No already-delivered notifications matched that date.");
  if (summary.detailed_templates !== rows.length || summary.action_links !== rows.length) {
    throw new Error("Resend stopped: every notification must have a detailed template and action button.");
  }
  if (!execute) {
    console.log("Dry run only. Add --execute to send these notifications.");
    process.exitCode = 0;
  } else {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      throw new Error("SMTP email credentials are not configured.");
    }
    const port = Number(process.env.EMAIL_PORT || 587);
    transporter = nodemailer.createTransport({
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
    await withRetry(() => transporter.verify());

    const attachment = emailLogoAttachment();
    const from = `"CDS Space" <${process.env.EMAIL_FROM || "support@cdsspace.pro"}>`;
    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      // Compare-and-swap the audit counter so two explicit resend processes
      // cannot both send the same delivery version.
      const claim = await db.query(
        `update public.notification_email_queue
            set delivery_version = delivery_version + 1,
                resend_count = resend_count + 1,
                first_sent_at = coalesce(first_sent_at, sent_at),
                claimed_at = now(), last_attempted_at = now(), last_error = null
          where id = $1::uuid and delivery_version = $2 and resend_count = $3
          returning delivery_version`,
        [row.id, row.delivery_version, row.resend_count],
      );
      if (!claim.rowCount) {
        failed += 1;
        continue;
      }

      const deliveryVersion = claim.rows[0].delivery_version;
      const root = threadRoot(row.recipient_email, row.category);
      try {
        await withRetry(() => transporter.sendMail({
          from,
          to: row.recipient_email,
          subject: CATEGORY_SUBJECT[row.category] || row.subject,
          html: row.html,
          text: row.text_body,
          attachments: row.html.includes("cid:cdslogo@cdsspace") ? [attachment] : undefined,
          references: root,
          inReplyTo: root,
          // Retries deliberately retain this ID so an ambiguous transport
          // failure cannot create two visible copies in the inbox.
          messageId: `<cds-item-${row.id}-v${deliveryVersion}@cdsspace.pro>`,
          date: new Date(),
        }));
        await db.query(
          `update public.notification_email_queue
              set sent_at = now(), claimed_at = null, last_error = null
            where id = $1::uuid`,
          [row.id],
        );
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Email delivery failed";
        await db.query(
          `update public.notification_email_queue
              set claimed_at = null, last_error = left($2, 1000)
            where id = $1::uuid`,
          [row.id, message],
        );
        failed += 1;
      }

      if ((sent + failed) % 10 === 0 || sent + failed === rows.length) {
        console.log({ processed: sent + failed, sent, failed, total: rows.length });
      }
    }

    if (failed) throw new Error(`${failed} notification resend(s) failed; ${sent} succeeded.`);
    console.log({ complete: true, sent, failed, conversations: summary.recipients });
  }
} finally {
  transporter?.close();
  await db.end();
}
