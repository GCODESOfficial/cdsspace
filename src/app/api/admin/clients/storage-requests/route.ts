import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getGlashPoolClient, glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_GRANTS = new Set([1024 ** 3, 2 * 1024 ** 3, 5 * 1024 ** 3]);

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "clients.view");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requests = await glashQuery(
    `select request.id, request.client_user_id, request.requested_at,
            profile.full_name, profile.company_name, profile.email,
            coalesce(account.storage_limit_bytes, 2147483648)::text as storage_limit_bytes
       from public.client_storage_requests request
       join public.profiles profile on profile.id = request.client_user_id
       left join public.create_credit_accounts account
         on account.owner_kind = 'client' and account.owner_id = request.client_user_id::text
      where request.status = 'pending'
      order by request.requested_at`,
  );
  return NextResponse.json({ ok: true, requests });
}

export async function PATCH(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "clients.update");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const requestId = String(body.requestId || "");
  const grantBytes = Number(body.grantBytes || 0);
  const decision = body.decision === "decline" ? "decline" : "approve";
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return NextResponse.json({ error: "Invalid storage request." }, { status: 400 });
  if (decision === "approve" && !ALLOWED_GRANTS.has(grantBytes)) return NextResponse.json({ error: "Choose a supported storage increase." }, { status: 400 });

  const client = await getGlashPoolClient();
  let clientUserId = "";
  try {
    await client.query("begin");
    const locked = await client.query<{ client_user_id: string }>(
      `select client_user_id from public.client_storage_requests
        where id = $1::uuid and status = 'pending' for update`,
      [requestId],
    );
    clientUserId = locked.rows[0]?.client_user_id || "";
    if (!clientUserId) {
      await client.query("rollback");
      return NextResponse.json({ error: "This storage request has already been handled." }, { status: 409 });
    }
    if (decision === "approve") {
      await client.query(
        `insert into public.create_credit_accounts (owner_kind, owner_id, monthly_credit_limit, storage_limit_bytes)
         values ('client', $1, 50, 2147483648 + $2::bigint)
         on conflict (owner_kind, owner_id) do update
           set storage_limit_bytes = public.create_credit_accounts.storage_limit_bytes + $2::bigint,
               updated_at = now()`,
        [clientUserId, grantBytes],
      );
    }
    await client.query(
      `update public.client_storage_requests
          set status = $2, reviewed_at = now(), reviewed_by = $3
        where id = $1::uuid`,
      [requestId, decision === "approve" ? "approved" : "declined", session.email || session.role],
    );
    await client.query("commit");
    await glashQuery(
      `insert into public.notifications (user_id, type, title, message, is_read)
       values ($1::uuid, 'status_change', $2, $3, false)`,
      [
        clientUserId,
        decision === "approve" ? "More storage is available" : "Storage request reviewed",
        decision === "approve" ? "CDS Space approved more workspace storage for your account." : "Your storage request was reviewed. Contact CDS Space if you need help.",
      ],
    ).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not review the storage request." }, { status: 500 });
  } finally {
    client.release();
  }
}
