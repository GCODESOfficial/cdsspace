import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { glashPool, glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "clients.banners.view");
  if (denied) return denied;
  const requests = await glashQuery(
    `select er.*, br.display_id, br.title, br.status as banner_status,
            p.full_name as client_name, p.company_name, p.email as client_email
       from public.banner_edit_requests er
       join public.banner_requests br on br.id = er.banner_request_id
       left join public.profiles p on p.id = er.user_id
      order by case er.status when 'submitted' then 0 when 'in_review' then 1 else 2 end,
               er.requested_at desc`,
  );
  return NextResponse.json({ requests });
}

export async function PATCH(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "clients.banners.edit");
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  const status = String(body.status || "");
  const adminNote = String(body.adminNote || "").trim().slice(0, 3000) || null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["in_review", "resolved", "declined"].includes(status)) {
    return NextResponse.json({ error: "Choose a valid request and review status." }, { status: 400 });
  }

  const client = await glashPool.connect();
  try {
    await client.query("begin");
    const result = await client.query<{ banner_request_id: string; user_id: string; banner_status: string }>(
      `update public.banner_edit_requests er
          set status = $2, admin_note = $3, reviewed_at = now(), reviewed_by = 'CDS Space admin'
         from public.banner_requests br
        where er.id = $1 and br.id = er.banner_request_id
      returning er.banner_request_id, er.user_id, br.status::text as banner_status`,
      [id, status, adminNote],
    );
    const row = result.rows[0];
    if (!row) {
      await client.query("rollback");
      return NextResponse.json({ error: "Edit request not found." }, { status: 404 });
    }
    await client.query(
      `insert into public.status_updates (entity_type, entity_id, previous_status, new_status, note, updated_by)
       values ('banner_request', $1, $2, $2, $3, 'CDS Space admin')`,
      [row.banner_request_id, row.banner_status, adminNote || `Edit request marked ${status.replaceAll("_", " ")}.`],
    );
    await client.query(
      `insert into public.notifications (user_id, type, title, message, link, is_read)
       values ($1, 'status_change', 'Banner edit request updated', $2, '/dashboard/banners', false)`,
      [row.user_id, adminNote || `Your banner edit request is now ${status.replaceAll("_", " ")}.`],
    );
    await client.query("commit");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the request." }, { status: 500 });
  } finally {
    client.release();
  }
}
