import "server-only";

import { glashQuery } from "@/lib/glashdb/postgres";

/**
 * When people were last active, for WhatsApp-style "online" / "last seen" in
 * chats. Team members: their signed-in devices (team_device_sessions); clients:
 * client_presence (the app and dashboard check in every few seconds while
 * open); admins: admin_presence (recorded below by the admin's incoming-call check).
 */

/** Called by the admin's incoming-call check (every few seconds while the admin app or site is open). */
export async function recordAdminPresence(input: { key: string; superAdmin: boolean; takesClientMessages: boolean }) {
  await glashQuery(
    `insert into public.admin_presence (admin_key, is_super_admin, takes_client_messages, last_seen_at)
     values ($1, $2, $3, now())
     on conflict (admin_key) do update
        set is_super_admin = excluded.is_super_admin,
            takes_client_messages = excluded.takes_client_messages,
            last_seen_at = now()`,
    [input.key, input.superAdmin, input.takesClientMessages],
  ).catch(() => undefined);
}

/**
 * Last-seen times (ISO, or null) for:
 *  - team:<member id>  a team member (any device; a sub-admin's admin portal counts too)
 *  - client:<user id>  a client
 *  - cds               CDS Space: whichever admin who answers client messages was active last
 *  - superadmin        the super admin
 */
export async function lastSeen(keys: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  const teamIds = keys.filter((key) => key.startsWith("team:")).map((key) => key.slice(5)).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const clientIds = keys.filter((key) => key.startsWith("client:")).map((key) => key.slice(7)).filter((id) => /^[0-9a-f-]{36}$/i.test(id));

  if (teamIds.length) {
    const rows = await glashQuery<{ id: string; seen: string | null }>(
      `select m.id::text,
              greatest(
                (select max(s.last_seen_at) from public.team_device_sessions s where s.team_member_id = m.id and s.revoked_at is null),
                (select a.last_seen_at from public.admin_presence a where a.admin_key = m.id::text)
              )::text as seen
         from public.team_members m
        where m.id = any($1::uuid[])`,
      [teamIds],
    ).catch(() => []);
    for (const row of rows) result[`team:${row.id}`] = row.seen;
  }
  if (clientIds.length) {
    const rows = await glashQuery<{ id: string; seen: string | null }>(
      `select client_user_id::text as id, last_seen_at::text as seen from public.client_presence where client_user_id = any($1::uuid[])`,
      [clientIds],
    ).catch(() => []);
    for (const row of rows) result[`client:${row.id}`] = row.seen;
  }
  if (keys.includes("cds") || keys.includes("superadmin")) {
    const row = (await glashQuery<{ cds: string | null; superadmin: string | null }>(
      `select max(last_seen_at) filter (where takes_client_messages)::text as cds,
              max(last_seen_at) filter (where is_super_admin)::text as superadmin
         from public.admin_presence`,
    ).catch(() => []))[0];
    if (keys.includes("cds")) result.cds = row?.cds ?? null;
    if (keys.includes("superadmin")) result.superadmin = row?.superadmin ?? null;
  }
  for (const key of keys) if (!(key in result)) result[key] = null;
  return result;
}
