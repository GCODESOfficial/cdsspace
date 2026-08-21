/**
 * Notification thread worker.
 *
 * Point a scheduler at GET /api/cron/notification-digest every ~5-15 min
 * (Authorization: Bearer CRON_SECRET). It flushes public.notification_email_queue,
 * sending each queued notification as its OWN email but threading all items of the
 * same category to a recipient into a single inbox conversation (e.g. "Taskboard").
 * Each message keeps its own event time, so the inbox reads like a tidy follow-up
 * thread rather than one compressed summary.
 */
import { NextRequest, NextResponse } from "next/server";
import { glashQuery } from "@/lib/glashdb/postgres";
import { createEmailTransport, sendEmail, notificationThreadRoot } from "@/lib/email-from";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface QueueRow {
  id: string; recipient_email: string; category: string; subject: string;
  title: string; body: string | null; link: string | null; html: string | null;
  text_body: string | null; from_name: string | null; created_at: string;
  delivery_version: number;
}

// The conversation title each category threads under.
const CATEGORY_SUBJECT: Record<string, string> = {
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

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // Atomically claim work so overlapping scheduler/manual runs cannot send the
  // same message twice. An abandoned claim becomes eligible again after 15 min.
  const rows = await glashQuery<QueueRow>(
    `with due as (
       select id
         from public.notification_email_queue
        where sent_at is null
          and (claimed_at is null or claimed_at < now() - interval '15 minutes')
        order by recipient_email, category, created_at
        limit 2000
        for update skip locked
     )
     update public.notification_email_queue q
        set claimed_at = now(), last_attempted_at = now(), last_error = null
       from due
      where q.id = due.id
      returning q.id, q.recipient_email, q.category, q.subject, q.title, q.body,
                q.link, q.html, q.text_body, q.from_name, q.created_at,
                q.delivery_version`,
  );
  if (!rows.length) return NextResponse.json({ ok: true, emails: 0, items: 0 });

  // Reuse one transport across the whole flush.
  const transporter = createEmailTransport();
  let emails = 0;
  const threaded = new Set<string>();

  for (const row of rows) {
    const root = notificationThreadRoot(row.recipient_email, row.category);
    try {
      await sendEmail({
        to: row.recipient_email,
        // A consistent per-category subject makes the messages group into one
        // conversation; the specific task/detail lives in the message body.
        subject: CATEGORY_SUBJECT[row.category] || row.subject,
        html: row.html || undefined,
        text: row.text_body || undefined,
        fromName: row.from_name || "CDS Space",
        transporter,
        // Thread every item of this category to the recipient into one conversation.
        references: root,
        inReplyTo: root,
        messageId: `<cds-item-${row.id}-v${row.delivery_version}@cdsspace.pro>`,
        // Reflect the real event time so the thread reads like OPay-style receipts.
        date: row.created_at ? new Date(row.created_at) : undefined,
      });
      await glashQuery(
        `update public.notification_email_queue
            set first_sent_at = coalesce(first_sent_at, now()),
                sent_at = now(), claimed_at = null, last_error = null
          where id = $1::uuid`,
        [row.id],
      );
      emails += 1;
      threaded.add(`${row.recipient_email}|${row.category}`);
    } catch (error) {
      console.error("[notification-thread] send failed:", error);
      await glashQuery(
        `update public.notification_email_queue
            set claimed_at = null, last_error = left($2, 1000)
          where id = $1::uuid`,
        [row.id, error instanceof Error ? error.message : "Email delivery failed"],
      ).catch(() => []);
    }
  }
  transporter.close();

  return NextResponse.json({ ok: true, emails, items: rows.length, conversations: threaded.size });
}
