import { NextResponse } from "next/server";
import { glashQuery } from "@/lib/glashdb/postgres";
import { getTeamSession } from "@/lib/team-auth";

export const runtime = "nodejs";

type TeamNotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  thread_id: string | null;
  project_id?: string | null;
  document_id?: string | null;
  work_id?: string | null;
  meeting_id?: string | null;
  signature_request_id?: string | null;
  created_at: string;
  read_at: string | null;
};

function normalizeTeamNotificationLink(row: TeamNotificationRow) {
  if (row.link) return row.link;
  if (row.thread_id) return `/team/chat?thread=${row.thread_id}`;
  if (row.project_id) return `/team/work?project=${row.project_id}`;
  if (row.work_id) return `/team/work?work=${row.work_id}`;
  if (row.document_id) return `/team/cdocs?document=${row.document_id}`;
  if (row.meeting_id) return `/team/cmeet?meeting=${row.meeting_id}`;
  if (row.signature_request_id) return `/team/csign?request=${row.signature_request_id}`;
  return null;
}

export async function GET() {
  const session = await getTeamSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const data = await glashQuery<TeamNotificationRow>(
    `select *
       from public.team_notifications
      where recipient_id = $1
      order by created_at desc
      limit 50`,
    [session.id],
  );

  // Reaching the member's open dashboard means pending chat payloads have
  // arrived at their client, even if the thread itself has not been opened.
  await glashQuery(
    `update public.team_chat_message_receipts
        set delivered_at = coalesce(delivered_at, now()),
            last_seen_at = now()
      where team_member_id = $1::uuid
        and delivered_at is null`,
    [session.id],
  ).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    notifications: data.map((row) => ({
      ...row,
      link: normalizeTeamNotificationLink(row),
    })),
  });
}

export async function PATCH(req: Request) {
  const session = await getTeamSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { ids, all } = body as { ids?: string[]; all?: boolean };
  if (!all && (!Array.isArray(ids) || ids.length === 0)) {
    return NextResponse.json({ ok: false, error: "ids or all is required" }, { status: 400 });
  }

  if (all) {
    await glashQuery(
      `update public.team_notifications
          set read_at = now()
        where recipient_id = $1
          and read_at is null`,
      [session.id],
    );
  } else {
    await glashQuery(
      `update public.team_notifications
          set read_at = now()
        where recipient_id = $1
          and read_at is null
          and id = any($2::uuid[])`,
      [session.id, ids],
    );
  }

  return NextResponse.json({ ok: true });
}
