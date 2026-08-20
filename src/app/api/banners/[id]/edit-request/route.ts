import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { glashPool } from "@/lib/glashdb/postgres";
import { notifySuperAdmin } from "@/lib/notify-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Invalid banner order" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const message = String(body.message || "").trim();
  if (message.length < 10 || message.length > 3000) {
    return NextResponse.json({ error: "Describe the requested change in 10 to 3,000 characters." }, { status: 400 });
  }

  const client = await glashPool.connect();
  try {
    await client.query("begin");
    const orderResult = await client.query<{ id: string; display_id: string; title: string; status: string }>(
      `select id, display_id, title, status::text
         from public.banner_requests
        where id = $1 and user_id = $2
        for update`,
      [id, session.user.id],
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query("rollback");
      return NextResponse.json({ error: "Banner order not found" }, { status: 404 });
    }
    if (["DRAFT", "CANCELLED", "ARCHIVED"].includes(order.status)) {
      await client.query("rollback");
      return NextResponse.json({ error: "This order is not currently available for an edit request." }, { status: 409 });
    }

    const existing = await client.query<{ id: string }>(
      `select id from public.banner_edit_requests
        where banner_request_id = $1 and status in ('submitted', 'in_review')
        limit 1 for update`,
      [id],
    );
    const editRequest = existing.rows[0]
      ? await client.query(
          `update public.banner_edit_requests
              set message = $2, status = 'submitted', requested_at = now(), reviewed_at = null, reviewed_by = null
            where id = $1
          returning *`,
          [existing.rows[0].id, message],
        )
      : await client.query(
          `insert into public.banner_edit_requests (banner_request_id, user_id, message)
           values ($1, $2, $3)
           returning *`,
          [id, session.user.id, message],
        );

    await client.query(
      `insert into public.status_updates
        (entity_type, entity_id, previous_status, new_status, note, updated_by)
       values ('banner_request', $1, $2, $2, $3, $4)`,
      [id, order.status, `Client requested an edit: ${message}`, session.user.email || session.user.id],
    );
    await client.query("commit");

    await notifySuperAdmin({
      type: "status_change",
      title: `Edit requested for ${order.display_id}`,
      message: `${order.title}: ${message}`,
      link: "/admin/clients/banners#edit-requests",
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, request: editRequest.rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not submit the edit request." }, { status: 500 });
  } finally {
    client.release();
  }
}
