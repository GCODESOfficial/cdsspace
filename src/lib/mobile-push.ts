import "server-only";

import { glashQuery } from "@/lib/glashdb/postgres";

/**
 * Notifications on phones with the CDS Space app, as they happen: a chat
 * message, a mention, a task. The app only checked the server every 15-30 s
 * while open, and nothing reached a closed app. Each signed-in portal on a
 * phone registers an Expo push token (POST /api/mobile/v1/push-devices); this
 * sends a normal notification (title, preview, the phone's message sound)
 * through the Expo push service to Android (Firebase) and iPhone (APNs).
 * Incoming calls use lib/mobile-call-push.ts instead.
 *
 * Recipients are registration subjects: 'client:<user id>', 'team:<member id>',
 * 'admin:<member id>' (sub-admins) or 'admin:<email>' (the super admin).
 * Best effort: never throws, never holds up the action that raised it.
 */

export type PhoneNotice = {
  title: string;
  body?: string | null;
  /** The web link it is about; the app opens the matching screen. */
  url?: string | null;
  /** What it is about (e.g. thread-<id>): the app stays quiet when that conversation is open. */
  tag?: string | null;
};

type Device = { id: string; subject_key: string; portal: string; token: string };

const memberSubjects = (memberId: string) => [`team:${memberId}`, `admin:${memberId}`];

/** A team member on every portal they may use on a phone (team, and admin for sub-admins). */
export const teamMemberSubjects = (memberIds: string[]) => [...new Set(memberIds.filter(Boolean).flatMap(memberSubjects))];

export async function pushToPhones(
  subjects: string[],
  notice: PhoneNotice,
  options: {
    /** Also the super admin's phones. */
    superAdmin?: boolean;
    /** Also every admin who handles client messages (super admin, Messages permission). */
    messageAdmins?: boolean;
    /** Never these (the sender's own phones). */
    exclude?: string[];
  } = {},
) {
  try {
    const wanted = [...new Set(subjects.filter(Boolean))];
    if (!wanted.length && !options.superAdmin && !options.messageAdmins) return;
    const devices = await glashQuery<Device>(
      `select id::text, subject_key, portal, token
         from public.mobile_push_devices
        where token_kind = 'expo'
          and (subject_key = any($1::text[])
               or ($2::boolean and portal = 'admin' and subject_key like 'admin:%@%')
               or ($3::boolean and portal = 'admin' and takes_client_calls))`,
      [wanted, Boolean(options.superAdmin), Boolean(options.messageAdmins)],
    );
    const excluded = new Set(options.exclude || []);
    const seen = new Set<string>();
    const targets = devices.filter((device) => {
      if (excluded.has(device.subject_key) || seen.has(device.token)) return false;
      seen.add(device.token);
      return true;
    });
    if (!targets.length) return;

    const body = String(notice.body || "").replace(/\s+/g, " ").trim();
    const messages = targets.map((device) => ({
      to: device.token,
      title: notice.title.slice(0, 120),
      body: body.length > 180 ? `${body.slice(0, 179)}…` : body,
      sound: "default",
      priority: "high",
      // The app's "Messages and updates" channel (src/services/sounds.js).
      channelId: "cds-messages",
      ttl: 12 * 60 * 60,
      data: { kind: "notice", url: notice.url || null, tag: notice.tag || null, portal: device.portal },
    }));

    const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
    if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    const gone: string[] = [];
    for (let start = 0; start < messages.length; start += 100) {
      const batch = messages.slice(start, start + 100);
      const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers, body: JSON.stringify(batch) });
      const result = (await response.json().catch(() => null)) as { data?: { details?: { error?: string } }[] } | null;
      (result?.data || []).forEach((ticket, index) => {
        if (ticket?.details?.error === "DeviceNotRegistered") gone.push(targets[start + index].id);
      });
    }
    if (gone.length) {
      await glashQuery(`delete from public.mobile_push_devices where id = any($1::uuid[])`, [gone]).catch(() => undefined);
    }
  } catch (error) {
    console.error("[mobile-push] delivery failed", error);
  }
}
