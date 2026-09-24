import "server-only";

import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { sendEmail } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";
import { publicSiteOrigin } from "@/lib/public-site";
import type { PushActorKind } from "@/lib/web-push-server";

/**
 * Keeps notification email from flooding an inbox.
 *
 * The first notice in a quiet period is sent at once, so a single event still
 * arrives immediately. Anything raised in the ten minutes after it is held and
 * sent as one summary, so a busy chat hour is one email rather than forty.
 * Device push is unaffected and stays instant.
 */
export const NOTIFICATION_EMAIL_WINDOW_MINUTES = 10;

export type NotificationEmailItem = {
  actorKind: PushActorKind;
  actorId: string;
  email: string;
  name?: string | null;
  title: string;
  body?: string | null;
  link?: string | null;
  kind?: string | null;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] as string
  ));
}

export function absoluteNotificationLink(link: string | null | undefined) {
  const origin = publicSiteOrigin().replace(/\/$/, "");
  if (!link) return origin;
  return /^https?:\/\//.test(link) ? link : `${origin}${link.startsWith("/") ? "" : "/"}${link}`;
}

/** Sends now if the recipient is quiet, otherwise holds it for the summary. */
export async function sendOrHoldNotificationEmail(item: NotificationEmailItem) {
  try {
    const openWindow = await glashMaybeOne<{ actor_id: string }>(
      `select actor_id from public.notification_email_windows
        where actor_kind = $1 and actor_id = $2
          and last_sent_at > now() - ($3 || ' minutes')::interval`,
      [item.actorKind, item.actorId, String(NOTIFICATION_EMAIL_WINDOW_MINUTES)],
    );

    if (openWindow) {
      await glashQuery(
        `insert into public.notification_email_batches
           (actor_kind, actor_id, recipient_email, title, body, link, kind)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [item.actorKind, item.actorId, item.email, item.title, item.body || null, item.link || null, item.kind || null],
      );
      return { held: true };
    }

    await deliverSingle(item);
    await touchWindow(item.actorKind, item.actorId);
    return { held: false };
  } catch (error) {
    console.error("[notification-email] send or hold failed", error);
    return { held: false };
  }
}

async function touchWindow(actorKind: string, actorId: string) {
  await glashQuery(
    `insert into public.notification_email_windows (actor_kind, actor_id, last_sent_at)
     values ($1,$2,now())
     on conflict (actor_kind, actor_id) do update set last_sent_at = now()`,
    [actorKind, actorId],
  );
}

async function deliverSingle(item: NotificationEmailItem) {
  const firstName = String(item.name || "").trim().split(/\s+/)[0] || "there";
  const url = absoluteNotificationLink(item.link);
  const body = item.body ? `<p style="margin:0 0 18px;">${escapeHtml(item.body)}</p>` : "";
  const html = brandedEmailHtml(
    `<h1 style="margin:0 0 14px;color:#0D1B39;font-size:22px;line-height:1.3;">${escapeHtml(item.title)}</h1>
     <p style="margin:0 0 16px;">Hello ${escapeHtml(firstName)},</p>
     ${body}
     <a href="${escapeHtml(url)}" style="display:inline-block;border-radius:10px;background:#0A4FE8;padding:12px 20px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;">Open in CDS Space</a>
     <p style="margin:20px 0 0;color:#69738D;font-size:13px;line-height:1.6;">You are receiving this because it concerns your work on CDS Space.</p>`,
    { eyebrow: "CDS Space notification", preheader: item.body || item.title },
  );
  await sendEmail({
    to: item.email,
    subject: item.title,
    text: `${item.title}\n\n${item.body || ""}\n\nOpen in CDS Space: ${url}`,
    html,
    fromName: "CDS Space",
  });
}

type BatchRow = {
  id: string;
  actor_kind: string;
  actor_id: string;
  recipient_email: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
};

/**
 * Sends one summary per recipient whose window has closed. Called by the
 * dispatch cron, so a held notice waits minutes at most.
 */
export async function flushNotificationEmailBatches(options: { dryRun?: boolean } = {}) {
  const rows = await glashQuery<BatchRow>(
    `select b.id::text, b.actor_kind, b.actor_id, b.recipient_email, b.title, b.body, b.link, b.created_at
       from public.notification_email_batches b
       left join public.notification_email_windows w
         on w.actor_kind = b.actor_kind and w.actor_id = b.actor_id
      where b.sent_at is null
        and (w.last_sent_at is null or w.last_sent_at <= now() - ($1 || ' minutes')::interval)
      order by b.created_at asc
      limit 2000`,
    [String(NOTIFICATION_EMAIL_WINDOW_MINUTES)],
  );
  if (!rows.length) return { recipients: 0, items: 0, dryRun: Boolean(options.dryRun) };

  const groups = new Map<string, BatchRow[]>();
  for (const row of rows) {
    const key = `${row.actor_kind}:${row.actor_id}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  if (options.dryRun) return { recipients: groups.size, items: rows.length, dryRun: true };

  let sentGroups = 0;
  for (const items of groups.values()) {
    try {
      await sendSummary(items);
      await glashQuery(
        `update public.notification_email_batches set sent_at = now() where id = any($1::uuid[])`,
        [items.map((item) => item.id)],
      );
      await touchWindow(items[0].actor_kind, items[0].actor_id);
      sentGroups += 1;
    } catch (error) {
      console.error("[notification-email] summary failed", error);
    }
  }
  return { recipients: sentGroups, items: rows.length, dryRun: false };
}

async function sendSummary(items: BatchRow[]) {
  const count = items.length;
  const heading = count === 1 ? "1 update while you were away" : `${count} updates while you were away`;
  const list = items.map((item) => {
    const url = absoluteNotificationLink(item.link);
    const time = new Date(item.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const detail = item.body ? `<p style="margin:4px 0 0;color:#69738D;font-size:13px;line-height:1.5;">${escapeHtml(item.body)}</p>` : "";
    return `<li style="margin:0 0 14px;padding:0 0 14px;border-bottom:1px solid #E6EAF4;list-style:none;">
      <a href="${escapeHtml(url)}" style="color:#0A4FE8;text-decoration:none;font-size:15px;font-weight:700;">${escapeHtml(item.title)}</a>
      <span style="color:#9AA3B8;font-size:12px;"> ${escapeHtml(time)}</span>
      ${detail}
    </li>`;
  }).join("");

  const html = brandedEmailHtml(
    `<h1 style="margin:0 0 14px;color:#0D1B39;font-size:22px;line-height:1.3;">${escapeHtml(heading)}</h1>
     <p style="margin:0 0 18px;">Here is everything raised for you in the last few minutes, grouped so your inbox stays readable.</p>
     <ul style="margin:0 0 20px;padding:0;">${list}</ul>
     <a href="${escapeHtml(absoluteNotificationLink(null))}" style="display:inline-block;border-radius:10px;background:#0A4FE8;padding:12px 20px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;">Open CDS Space</a>`,
    { eyebrow: "CDS Space notifications", preheader: `${heading}: ${items.map((item) => item.title).slice(0, 3).join(", ")}` },
  );

  await sendEmail({
    to: items[0].recipient_email,
    subject: heading,
    text: `${heading}\n\n${items.map((item) => `- ${item.title}${item.body ? `: ${item.body}` : ""}\n  ${absoluteNotificationLink(item.link)}`).join("\n")}`,
    html,
    fromName: "CDS Space",
  });
}
