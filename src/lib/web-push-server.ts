import "server-only";

import webpush from "web-push";
import { glashQuery } from "@/lib/glashdb/postgres";

/**
 * Delivery of notifications to a browser that is not open.
 *
 * The in-app bell only updates while a dashboard tab is loaded, so anything
 * that happened after someone closed the site went unseen until they returned.
 * A push message is handed to the browser vendor's push service, which wakes
 * our service worker on the device and shows the notice even with the browser
 * closed. Nothing here throws: a failed push must never fail the action that
 * raised the notification.
 */
export type PushActorKind = "team" | "client" | "admin";

export type PushPayload = {
  title: string;
  body?: string | null;
  url?: string | null;
  tag?: string | null;
};

let configured: boolean | null = null;

function ready() {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn("[web-push] VAPID keys are not configured; browser push is disabled.");
    configured = false;
    return configured;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@cdsspace.pro", publicKey, privateKey);
  configured = true;
  return configured;
}

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/** Sends one notification to every device the actor has subscribed. */
export async function sendPushToActor(actorKind: PushActorKind, actorId: string, payload: PushPayload) {
  if (!ready() || !actorId) return;
  try {
    const devices = await glashQuery<{ id: string; endpoint: string; p256dh: string; auth: string }>(
      `select id::text, endpoint, p256dh, auth from public.push_subscriptions
        where actor_kind = $1 and actor_id = $2`,
      [actorKind, actorId],
    );
    if (!devices.length) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body || "",
      url: payload.url || "/",
      tag: payload.tag || `cds-${Date.now()}`,
    });

    await Promise.all(devices.map(async (device) => {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          body,
          { TTL: 12 * 60 * 60, urgency: "high" },
        );
        await glashQuery(
          `update public.push_subscriptions set failure_count = 0, last_seen_at = now() where id = $1::uuid`,
          [device.id],
        );
      } catch (error) {
        const status = Number((error as { statusCode?: number })?.statusCode || 0);
        // 404 and 410 mean the browser threw the subscription away: the row is
        // dead weight and would otherwise be retried forever.
        if (status === 404 || status === 410) {
          await glashQuery(`delete from public.push_subscriptions where id = $1::uuid`, [device.id]);
          return;
        }
        await glashQuery(
          `update public.push_subscriptions set failure_count = failure_count + 1 where id = $1::uuid`,
          [device.id],
        );
      }
    }));
  } catch (error) {
    console.error("[web-push] delivery failed", error);
  }
}

export async function sendPushToActors(actorKind: PushActorKind, actorIds: string[], payload: PushPayload) {
  await Promise.all([...new Set(actorIds)].map((id) => sendPushToActor(actorKind, id, payload)));
}
