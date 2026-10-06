import { NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/client/chat/message-info?id=<message>[&thread=<project thread>]
 * "Message info" for one of the client's own messages, in the same shape as
 * the team's (GET /api/team/chat/messages/[id]/status):
 *   { status: { seen, delivered, notSeen, offline, taskPost, members: [
 *       { id, name, avatarUrl, state: 'seen' | 'delivered' | 'not_seen', readAt, deliveredAt } ] } }
 *  - direct chat with CDS Space (no `thread`): one row, CDS Space, seen once
 *    the desk has read it (that chat records read, not when).
 *  - project chat (`thread`): each team member in it, from their read
 *    receipts, or how far they have read the conversation.
 */
type Member = { id: string; name: string; avatarUrl: string | null; state: "seen" | "delivered" | "not_seen"; readAt: string | null; deliveredAt: string | null };

const summary = (members: Member[]) => ({
  seen: members.filter((m) => m.state === "seen").length,
  delivered: members.filter((m) => m.state === "delivered").length,
  notSeen: members.filter((m) => m.state === "not_seen").length,
  offline: 0,
  taskPost: false,
  members,
});

export async function GET(request: Request) {
  const account = await getClientAccountState().catch(() => null);
  const userId = account?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const messageId = params.get("id") || "";
  const threadId = params.get("thread") || "";
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return NextResponse.json({ error: "Unknown message." }, { status: 400 });

  if (!threadId) {
    const message = await glashMaybeOne<{ is_read: boolean; delivery_status: string | null }>(
      `select is_read, delivery_status from public.chat_messages
        where id = $1::uuid and room_id = $2 and sender_role = 'client' and deleted_at is null`,
      [messageId, `client_${userId}`],
    );
    if (!message) return NextResponse.json({ error: "This message has no info." }, { status: 404 });
    const member: Member = {
      id: "cds-space",
      name: "CDS Space",
      avatarUrl: "/favicon.png",
      state: message.is_read ? "seen" : "delivered",
      readAt: null,
      deliveredAt: null,
    };
    return NextResponse.json({ status: summary([member]) });
  }

  if (!/^[0-9a-f-]{36}$/i.test(threadId)) return NextResponse.json({ error: "Unknown conversation." }, { status: 400 });
  const message = await glashMaybeOne<{ sent: string }>(
    `select coalesce(m.sent_at, m.created_at)::text as sent
       from public.team_chat_messages m
       join public.team_chat_client_participants cp on cp.thread_id = m.thread_id and cp.client_user_id = $3::uuid
      where m.id = $1::uuid and m.thread_id = $2::uuid and m.client_user_id = $3::uuid`,
    [messageId, threadId, userId],
  );
  if (!message) return NextResponse.json({ error: "This message has no info." }, { status: 404 });

  const rows = await glashQuery<{ id: string; name: string; avatar_url: string | null; read_at: string | null; delivered_at: string | null; seen_by_cursor: boolean; last_read_at: string | null }>(
    `select p.team_member_id::text as id,
            coalesce(member.full_name, 'Team member') as name,
            member.avatar_url,
            receipt.read_at::text, receipt.delivered_at::text,
            (p.last_read_at is not null and p.last_read_at >= $3::timestamptz) as seen_by_cursor,
            p.last_read_at::text
       from public.team_chat_participants p
       left join public.team_members member on member.id = p.team_member_id
       left join public.team_chat_message_receipts receipt
              on receipt.message_id = $1::uuid and receipt.team_member_id = p.team_member_id
      where p.thread_id = $2::uuid
      order by member.full_name`,
    [messageId, threadId, message.sent],
  );
  const members: Member[] = rows.map((row) => {
    const seen = Boolean(row.read_at) || row.seen_by_cursor;
    return {
      id: row.id,
      name: row.name,
      avatarUrl: row.avatar_url,
      state: seen ? "seen" : row.delivered_at ? "delivered" : "not_seen",
      readAt: row.read_at || (row.seen_by_cursor ? row.last_read_at : null),
      deliveredAt: row.delivered_at,
    };
  });
  return NextResponse.json({ status: summary(members) });
}
