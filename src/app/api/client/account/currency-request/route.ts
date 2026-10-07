import { NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { normalizeClientBillingCurrency } from "@/lib/client-billing";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { notifySuperAdmin } from "@/lib/notify-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Billing currency change requests (client side). The billing currency is set once
 * during account setup; a client who needs a different one asks here and an admin
 * approves or declines it (/api/admin/clients/currency-requests).
 *
 * A client can file at most MAX_REQUESTS (pending, approved or declined; withdrawn ones
 * don't count). After that the currency can't be changed through the dashboard.
 *
 *   GET    → { currency, request, used, limit }  the account's currency, latest request and allowance
 *   POST   { requestedCurrency, reason } → files a pending request
 *   DELETE → withdraws the pending request
 */

interface CurrencyRequestRow {
  id: string;
  current_currency: string;
  requested_currency: string;
  reason: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  requested_at: string;
  reviewed_at: string | null;
  review_note: string | null;
}

const MAX_REQUESTS = 2;

async function usedRequests(userId: string) {
  const row = await glashMaybeOne<{ used: number }>(
    `select count(*)::int as used from public.client_currency_change_requests
      where client_user_id = $1::uuid and status in ('pending', 'approved', 'declined')`,
    [userId],
  );
  return row?.used ?? 0;
}

const COLUMNS = `id, current_currency, requested_currency, reason, status, requested_at, reviewed_at, review_note`;

function toJson(row: CurrencyRequestRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    currentCurrency: row.current_currency,
    requestedCurrency: row.requested_currency,
    reason: row.reason,
    status: row.status,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  };
}

async function latestRequest(userId: string) {
  return glashMaybeOne<CurrencyRequestRow>(
    `select ${COLUMNS} from public.client_currency_change_requests
      where client_user_id = $1::uuid and status <> 'cancelled'
      order by requested_at desc
      limit 1`,
    [userId],
  );
}

export async function GET() {
  const account = await getClientAccountState();
  if (!account?.agreement) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [request, used] = await Promise.all([latestRequest(account.user.id), usedRequests(account.user.id)]);
  return NextResponse.json({ ok: true, currency: account.profile.billing_currency, request: toJson(request), used, limit: MAX_REQUESTS });
}

export async function POST(req: Request) {
  const account = await getClientAccountState();
  if (!account?.agreement) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const current = account.profile.billing_currency;
  if (!current) return NextResponse.json({ error: "Choose your billing currency to finish setting up your account first." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const requested = normalizeClientBillingCurrency(body.requestedCurrency);
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (!requested) return NextResponse.json({ error: "Choose one of the supported billing currencies." }, { status: 400 });
  if (requested === current) return NextResponse.json({ error: `Your billing currency is already ${current}.` }, { status: 400 });
  if (reason.length < 10) return NextResponse.json({ error: "Tell us briefly why you need to change currency." }, { status: 400 });
  const used = await usedRequests(account.user.id);
  if (used >= MAX_REQUESTS) {
    return NextResponse.json({ error: `You have used all ${MAX_REQUESTS} currency change requests for this account.`, used, limit: MAX_REQUESTS }, { status: 403 });
  }

  const row = await glashMaybeOne<CurrencyRequestRow>(
    `insert into public.client_currency_change_requests (client_user_id, current_currency, requested_currency, reason)
     values ($1::uuid, $2, $3, $4)
     on conflict (client_user_id) where status = 'pending' do nothing
     returning ${COLUMNS}`,
    [account.user.id, current, requested, reason],
  );
  if (!row) return NextResponse.json({ error: "You already have a currency change request waiting for review." }, { status: 409 });

  const name = account.profile.full_name || account.profile.company_name || account.profile.email || "A client";
  await notifySuperAdmin({
    type: "status_change",
    title: "Client requested a currency change",
    message: `${name} asked to change their billing currency from ${current} to ${requested}.`,
    link: "/admin/clients/list#currency-requests",
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, request: toJson(row), used: used + 1, limit: MAX_REQUESTS }, { status: 201 });
}

export async function DELETE() {
  const account = await getClientAccountState();
  if (!account?.agreement) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await glashMaybeOne(
    `update public.client_currency_change_requests
        set status = 'cancelled', reviewed_at = now()
      where client_user_id = $1::uuid and status = 'pending'
      returning id`,
    [account.user.id],
  );
  const [request, used] = await Promise.all([latestRequest(account.user.id), usedRequests(account.user.id)]);
  return NextResponse.json({ ok: true, request: toJson(request), used, limit: MAX_REQUESTS });
}
