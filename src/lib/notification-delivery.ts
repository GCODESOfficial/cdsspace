import "server-only";

import { glashQuery } from "@/lib/glashdb/postgres";
import { sendPushToActor } from "@/lib/web-push-server";
import { sendOrHoldNotificationEmail } from "@/lib/notification-email-batching";

/**
 * Carries a notification beyond the in-app bell: to the device as a push
 * notice, and to the inbox as email.
 *
 * The bell only updates while a dashboard tab is open, so anything raised
 * after someone closed the site was invisible until they came back. Push is
 * immediate. Email is immediate for the first notice, then batched into a
 * summary while the recipient keeps receiving more, so a busy hour is one
 * email rather than forty. Both are best effort and never throw: a
 * notification that cannot be delivered must not fail the action that raised
 * it.
 */
export type OutsideNotification = {
  recipient_id: string;
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
};

export async function deliverTeamNotificationsOutside(items: OutsideNotification[]) {
  const recipients = [...new Set(items.map((item) => item.recipient_id).filter(Boolean))];
  if (!recipients.length) return;

  try {
    const people = await glashQuery<{ id: string; full_name: string; email: string | null }>(
      `select id::text, full_name, email from public.team_members
        where id = any($1::uuid[]) and is_active = true`,
      [recipients],
    );
    const byId = new Map(people.map((person) => [person.id, person]));

    await Promise.all(items.map(async (item) => {
      const person = byId.get(item.recipient_id);
      if (!person) return;
      await Promise.all([
        sendPushToActor("team", item.recipient_id, {
          title: item.title,
          body: item.body,
          url: item.link || "/team",
          tag: item.kind,
        }),
        person.email
          ? sendOrHoldNotificationEmail({
            actorKind: "team",
            actorId: item.recipient_id,
            email: person.email,
            name: person.full_name,
            title: item.title,
            body: item.body,
            link: item.link,
            kind: item.kind,
          })
          : Promise.resolve(),
      ]);
    }));
  } catch (error) {
    console.error("[notification-delivery] team delivery failed", error);
  }
}

type ClientNotificationRow = {
  id: string;
  user_id: string;
  title: string | null;
  message: string | null;
  link: string | null;
  type: string | null;
  email: string | null;
  full_name: string | null;
};

/**
 * Sends one client notice to their devices and inbox, and records that it went
 * out so the sweep below never repeats it.
 */
export async function deliverClientNotification(row: ClientNotificationRow, options: { pushOnly?: boolean } = {}) {
  const title = row.title || "CDS Space update";
  await Promise.all([
    sendPushToActor("client", row.user_id, {
      title,
      body: row.message,
      url: row.link || "/dashboard",
      tag: row.type || "cds-client",
    }),
    row.email && !options.pushOnly
      ? sendOrHoldNotificationEmail({
        actorKind: "client",
        actorId: row.user_id,
        email: row.email,
        name: row.full_name,
        title,
        body: row.message,
        link: row.link,
        kind: row.type,
      })
      : Promise.resolve(),
  ]);
  await glashQuery(`update public.notifications set dispatched_at = now() where id = $1`, [row.id]);
}

const PENDING_SQL = `select n.id::text, n.user_id::text, n.title, n.message, n.link, n.type,
         p.email, p.full_name
    from public.notifications n
    left join public.profiles p on p.id = n.user_id
   where n.dispatched_at is null`;

/** Delivers one client notice immediately, by id, for the paths that raise them inline. */
export async function deliverClientNotificationById(notificationId: string, options: { pushOnly?: boolean } = {}) {
  try {
    const rows = await glashQuery<ClientNotificationRow>(PENDING_SQL + ` and n.id = $1 limit 1`, [notificationId]);
    if (rows[0]) await deliverClientNotification(rows[0], options);
  } catch (error) {
    console.error("[notification-delivery] client delivery failed", error);
  }
}

/**
 * The safety net: anything raised by a route that does not deliver inline is
 * swept up here. Only recent rows, so switching this on cannot email a backlog.
 */
export async function dispatchPendingClientNotifications(options: { dryRun?: boolean; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const rows = await glashQuery<ClientNotificationRow>(
    `${PENDING_SQL} and n.created_at > now() - interval '2 hours'
      order by n.created_at asc limit ${limit}`,
  );
  if (options.dryRun) return { found: rows.length, sent: 0, dryRun: true };

  let sent = 0;
  for (const row of rows) {
    try {
      await deliverClientNotification(row);
      sent += 1;
    } catch (error) {
      console.error("[notification-delivery] sweep failed for", row.id, error);
    }
  }
  return { found: rows.length, sent, dryRun: false };
}
