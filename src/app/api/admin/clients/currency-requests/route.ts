import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getGlashPoolClient, glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Billing currency change requests (admin side), filed by clients through
 * /api/client/account/currency-request.
 *
 *   GET   → pending requests, oldest first
 *   PATCH { requestId, decision: "approve" | "decline", note? }
 *         approve switches the client's billing currency; either way the client is notified.
 */

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "clients.view");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requests = await glashQuery(
    `select request.id, request.client_user_id, request.current_currency, request.requested_currency,
            request.reason, request.requested_at,
            profile.full_name, profile.company_name, profile.email, profile.public_user_id,
            profile.billing_currency
       from public.client_currency_change_requests request
       join public.profiles profile on profile.id = request.client_user_id
      where request.status = 'pending'
      order by request.requested_at`,
  );
  return NextResponse.json({ ok: true, requests });
}

export async function PATCH(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "clients.edit");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const requestId = String(body.requestId || "");
  const decision = body.decision === "decline" ? "decline" : "approve";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return NextResponse.json({ error: "Invalid currency request." }, { status: 400 });

  const client = await getGlashPoolClient();
  let clientUserId = "";
  let requested = "";
  try {
    await client.query("begin");
    const locked = await client.query<{ client_user_id: string; requested_currency: string }>(
      `select client_user_id, requested_currency from public.client_currency_change_requests
        where id = $1::uuid and status = 'pending' for update`,
      [requestId],
    );
    clientUserId = locked.rows[0]?.client_user_id || "";
    requested = locked.rows[0]?.requested_currency || "";
    if (!clientUserId) {
      await client.query("rollback");
      return NextResponse.json({ error: "This currency request has already been handled." }, { status: 409 });
    }
    if (decision === "approve") {
      await client.query(
        `update public.profiles
            set billing_currency = $2,
                billing_currency_selected_at = now(),
                updated_at = now()
          where id = $1::uuid`,
        [clientUserId, requested],
      );
    }
    await client.query(
      `update public.client_currency_change_requests
          set status = $2, reviewed_at = now(), reviewed_by = $3, review_note = $4
        where id = $1::uuid`,
      [requestId, decision === "approve" ? "approved" : "declined", session.email || session.role, note],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not review the currency request." }, { status: 500 });
  } finally {
    client.release();
  }

  await glashQuery(
    `insert into public.notifications (user_id, type, title, message, is_read)
     values ($1::uuid, 'status_change', $2, $3, false)`,
    [
      clientUserId,
      decision === "approve" ? "Billing currency changed" : "Currency change request declined",
      decision === "approve"
        ? `Your billing currency is now ${requested}. New quotations, invoices and plan prices use it.`
        : `Your request to change your billing currency to ${requested} was declined.${note ? ` ${note}` : " Contact CDS Space if you need help."}`,
    ],
  ).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
