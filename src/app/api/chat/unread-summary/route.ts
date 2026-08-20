import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "super_admin" && !hasPermission(session.permissions, "messages")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const summary = await glashMaybeOne<{ unread_count: number; newest_unread_at: string | null }>(
    `select count(*)::int as unread_count,
            max(created_at)::text as newest_unread_at
       from public.chat_messages
      where sender_role = 'client'
        and is_read = false`,
  );

  return NextResponse.json({
    ok: true,
    unreadCount: Number(summary?.unread_count || 0),
    newestUnreadAt: summary?.newest_unread_at || null,
  });
}
