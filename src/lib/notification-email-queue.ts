import "server-only";

/**
 * The notification email worker.
 *
 * Queued notifications are sent as their own emails, threaded into one inbox
 * conversation per category and recipient. This lives in a library rather than
 * in the cron route because the app also runs it itself: the queue once stood
 * still for twelve days when the external scheduler stopped calling, and 129
 * emails were never even attempted.
 */
import { glashQuery } from "@/lib/glashdb/postgres";
import { createEmailTransport, sendEmail, notificationThreadRoot } from "@/lib/email-from";

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

export async function flushNotificationEmailQueue(limit = 200, maxAgeHours?: number) {
  // Atomically claim work so overlapping scheduler/manual runs cannot send the
  // same message twice. An abandoned claim becomes eligible again after 15 min.
  const rows = await glashQuery<QueueRow>(
    `with due as (
       select id
         from public.notification_email_queue
        where sent_at is null
          and (claimed_at is null or claimed_at < now() - interval '15 minutes')
          ${maxAgeHours ? `and created_at > now() - interval '${Math.max(1, Math.round(maxAgeHours))} hours'` : ""}
        order by recipient_email, category, created_at
        limit ${Math.max(1, Math.min(limit, 2000))}
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
  if (!rows.length) return { emails: 0, items: 0, conversations: 0 };

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

  return { emails, items: rows.length, conversations: threaded.size };
}

/** How far behind the queue is, for health checks and alerts. */
export async function notificationQueueBacklog() {
  const rows = await glashQuery<{ pending: number; oldest: string | null; failing: number }>(
    `select count(*) filter (where sent_at is null)::int as pending,
            min(created_at) filter (where sent_at is null)::text as oldest,
            count(*) filter (where sent_at is null and last_error is not null)::int as failing
       from public.notification_email_queue`,
  );
  const row = rows[0] || { pending: 0, oldest: null, failing: 0 };
  const oldestMinutes = row.oldest ? Math.round((Date.now() - new Date(row.oldest).getTime()) / 60000) : 0;
  return { pending: Number(row.pending || 0), failing: Number(row.failing || 0), oldestMinutes };
}

/**
 * The app's own safety net.
 *
 * Notification email used to depend entirely on an external scheduler calling
 * the cron route. When that stopped, nothing noticed: 129 emails sat unsent
 * for twelve days with no attempt recorded against them. Ordinary traffic now
 * nudges the queue along, so email keeps moving even with no scheduler at all.
 *
 * Deliberately cheap: at most one pass a minute per server, a small batch, and
 * only when something has actually been waiting.
 */
const SWEEP_EVERY_MS = 60_000;
const SWEEP_AFTER_MINUTES = 2;
const SWEEP_BATCH = 40;
const SWEEP_MAX_AGE_HOURS = 48;

declare global {
  var cdsEmailSweepAt: number | undefined;
  var cdsEmailSweepRunning: boolean | undefined;
}

export async function sweepEmailQueueIfDue() {
  const now = Date.now();
  if (globalThis.cdsEmailSweepRunning) return null;
  if (globalThis.cdsEmailSweepAt && now - globalThis.cdsEmailSweepAt < SWEEP_EVERY_MS) return null;
  globalThis.cdsEmailSweepAt = now;
  globalThis.cdsEmailSweepRunning = true;
  try {
    const backlog = await notificationQueueBacklog();
    if (!backlog.pending || backlog.oldestMinutes < SWEEP_AFTER_MINUTES) return null;
    // Loud on purpose: a backlog this old means the scheduler is not calling.
    if (backlog.oldestMinutes > 60) {
      console.error(`[notification-email] ${backlog.pending} emails waiting, oldest ${backlog.oldestMinutes} minutes. Sending them from the app.`);
    }
    // Only recent notices go out by themselves. A message from last week is
    // no longer news, and quietly sending a fortnight of backlog at someone is
    // worse than leaving it for a person to decide on.
    return await flushNotificationEmailQueue(SWEEP_BATCH, SWEEP_MAX_AGE_HOURS);
  } catch (error) {
    console.error("[notification-email] queue sweep failed", error);
    return null;
  } finally {
    globalThis.cdsEmailSweepRunning = false;
  }
}
