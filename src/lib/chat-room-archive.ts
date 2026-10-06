import "server-only";

import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

/**
 * Client conversations ("client_<user id>" rooms in chat_messages) the super
 * admin has archived: hidden from the other admins (they can't open or reply)
 * until restored; the client and the super admin carry on as usual. Team chat
 * threads keep their own archived_at.
 */
export async function isRoomArchived(roomId: string): Promise<boolean> {
  const row = await glashMaybeOne<{ room_id: string }>(
    `select room_id from public.chat_room_archives where room_id = $1`,
    [roomId],
  ).catch(() => null);
  return Boolean(row);
}

/** room id -> when it was archived. */
export async function archivedRooms(): Promise<Map<string, string>> {
  const rows = await glashQuery<{ room_id: string; archived_at: string }>(
    `select room_id, archived_at::text from public.chat_room_archives`,
  ).catch(() => []);
  return new Map(rows.map((row) => [row.room_id, row.archived_at]));
}

export async function setRoomArchived(roomId: string, archived: boolean, by: string | null) {
  if (archived) {
    await glashQuery(
      `insert into public.chat_room_archives (room_id, archived_by) values ($1, $2)
       on conflict (room_id) do update set archived_at = now(), archived_by = excluded.archived_by`,
      [roomId, by],
    );
  } else {
    await glashQuery(`delete from public.chat_room_archives where room_id = $1`, [roomId]);
  }
}
