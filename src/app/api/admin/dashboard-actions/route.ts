/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each metric is independent and best-effort: a missing table/column must not
// take down the whole dashboard, so every query is isolated and defaults to 0.
async function count(sql: string, params: any[] = []): Promise<number> {
  try {
    const row = await glashMaybeOne<{ n: number }>(sql, params);
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const [
    clientMessages,
    teamChat,
    newApplications,
    newConsultations,
    pendingLeave,
    pendingOrders,
    pendingBriefs,
  ] = await Promise.all([
    // Count the chat records directly so every authorised admin sees the same
    // accurate total; legacy profile-targeted notification rows can be absent.
    count(
      `select count(*)::int n
         from public.chat_messages
        where sender_role = 'client'
          and is_read = false`,
    ),
    // Unread team chat pings addressed to management.
    count(
      `select count(*)::int n from public.team_notifications
        where for_admin = true and read_at is null and kind in ('chat_message','chat_mention')`,
    ),
    count(`select count(*)::int n from public.role_applications where status = 'new'`),
    count(`select count(*)::int n from public.consultation_requests where status = 'new'`),
    count(`select count(*)::int n from public.team_leave_requests where status = 'pending'`),
    count(
      `select (
         (select count(*) from public.design_requests where status = 'PENDING')
       + (select count(*) from public.banner_requests where status = 'PENDING')
       )::int n`,
    ),
    count(`select count(*)::int n from public.brand_briefs where status in ('new','submitted','pending')`),
  ]);

  return NextResponse.json({
    ok: true,
    counts: {
      client_messages: clientMessages,
      team_chat: teamChat,
      applications: newApplications,
      consultations: newConsultations,
      leave: pendingLeave,
      orders: pendingOrders,
      briefs: pendingBriefs,
    },
  });
}
