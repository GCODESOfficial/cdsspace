/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Content Hub reminder worker.
 *
 * Driven by an EXTERNAL scheduler on glashdb.com - point a cron job at
 *   GET https://<your-domain>/api/cron/content-reminders
 * on a short interval (every 5 minutes is a good default), sending
 *   Authorization: Bearer <CRON_SECRET>
 * if CRON_SECRET is configured. Fires every due reminder once:
 *   - Dashboard: a team notification to the assigned publisher + an admin-wide
 *     notice (for_admin) so Management/Marketing see it too.
 *   - Email: a branded nudge to the publisher's inbox via EMAIL_USER/EMAIL_PASS
 *     (when that channel is on).
 * WhatsApp / Push are recognised channels but delivered out-of-band; we record
 * intent and leave hooks for those transports.
 *
 * Idempotent: each reminder is stamped sent_at the moment it's dispatched, so a
 * re-run (or overlapping cron tick) never double-sends.
 */
import { NextRequest, NextResponse } from "next/server";
import { emailFrom, createEmailTransport, dailyThreadHeaders, EMAIL_MODE } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";
import { glashQuery } from "@/lib/glashdb/postgres";
import { notifyTeamMember } from "@/lib/notify-team";
import { processClientChatEscalations } from "@/lib/client-chat-escalation";
import { emailAttachmentsFor } from "@/lib/email-logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OFFSET_TEXT: Record<string, string> = {
  "24h": "in 24 hours",
  "1h": "in 1 hour",
  "15m": "in 15 minutes",
  due: "now",
};

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured (dev) - allow
  const header = req.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Pull a batch of due, unsent reminders joined to their (still scheduled) item.
  const due = await glashQuery<any>(
    `select r.id as reminder_id, r.offset_label, r.channels,
            c.id as content_id, c.title, c.scheduled_at, c.scheduled_platform, c.platforms,
            c.assigned_publisher_id, c.assigned_publisher_name,
            m.email as publisher_email
       from public.content_reminders r
       join public.content_items c on c.id = r.content_id
       left join public.team_members m on m.id = c.assigned_publisher_id
      where r.sent_at is null
        and r.fire_at <= now()
        and c.status = 'scheduled'
      order by r.fire_at asc
      limit 100`,
  );

  let dashboard = 0;
  let emails = 0;

  // Lazily build the email transport once. HTTPS transports (Gmail API /
  // Resend) don't need EMAIL_PASS; SMTP fallback does.
  const canEmail = EMAIL_MODE !== "smtp" || !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
  const transporter = canEmail ? createEmailTransport() : null;

  for (const r of due) {
    const whenWord = OFFSET_TEXT[r.offset_label] || "soon";
    const when = r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "";
    const platform = r.scheduled_platform || (Array.isArray(r.platforms) ? r.platforms[0] : "") || "social";
    const title = `Posting ${whenWord}: ${r.title}`;
    const bodyText = `"${r.title}" is due to be posted on ${platform} at ${when}. Open Content Hub to copy the caption and download the assets.`;
    const link = `/admin/content-hub/library?id=${r.content_id}`;
    const channels: string[] = Array.isArray(r.channels) ? r.channels : ["dashboard"];

    // Dashboard → assigned publisher + admin-wide notice.
    if (channels.includes("dashboard")) {
      if (r.assigned_publisher_id) {
        await notifyTeamMember({
          recipient_id: r.assigned_publisher_id,
          kind: "content_reminder",
          title,
          body: bodyText,
          link,
          actor_is_admin: true,
        });
      }
      // Admin-wide (Management). recipient_id null + for_admin true.
      await glashQuery(
        `insert into public.team_notifications (recipient_id, for_admin, kind, title, body, link, actor_is_admin)
         values (null, true, 'content_reminder', $1, $2, $3, true)`,
        [title, bodyText, link],
      ).catch(() => {});
      dashboard++;
    }

    // Email → assigned publisher.
    if (channels.includes("email") && transporter && r.publisher_email) {
      const reminderHtml = brandedEmailHtml(
        `
            <h2 style="margin:0 0 8px;color:#0D1B39;">${r.title}</h2>
            <p style="color:#4B5563;">Due on <b>${platform}</b> at <b>${when}</b> (${whenWord}).</p>
            <p style="color:#4B5563;">Open Content Hub to copy the caption and download the assets.</p>
          `,
        { eyebrow: "Content Hub", preheader: `Due on ${platform} at ${when}` },
      );
      await transporter
        .sendMail({
          from: emailFrom("CDS Space Content Hub"),
          to: r.publisher_email,
          // Joins the publisher's conversation for the day.
          ...dailyThreadHeaders(r.publisher_email),
          html: reminderHtml,
          attachments: emailAttachmentsFor(reminderHtml),
        })
        .then(() => { emails++; })
        .catch(() => {});
    }

    // Mark sent so it never double-fires.
    await glashQuery(`update public.content_reminders set sent_at = now() where id = $1`, [r.reminder_id]);
  }

  // Reuse this established five-minute scheduler as a safety net for Sales Hub
  // response alerts. The dedicated chat cron route can also be scheduled;
  // database claims make overlapping calls idempotent.
  const clientChat = await processClientChatEscalations().catch((error) => {
    console.error("[content-reminders] client chat escalation failed", error);
    return null;
  });

  return NextResponse.json({ ok: true, processed: due.length, dashboard, emails, clientChat });
}
