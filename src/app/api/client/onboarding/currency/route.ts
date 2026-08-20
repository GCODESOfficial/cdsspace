import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/glashdb/server";
import { getClientAccountState, safeClientPath } from "@/lib/client-account";
import { normalizeClientBillingCurrency } from "@/lib/client-billing";
import { clientDashboardPath } from "@/lib/client-routes";
import { setClientDashboardSessionOnResponse } from "@/lib/client-dashboard-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const account = await getClientAccountState();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!account.agreement) return NextResponse.json({ error: "Complete the user agreement first." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const billingCurrency = normalizeClientBillingCurrency(body?.billingCurrency);
  if (!billingCurrency) {
    return NextResponse.json({ error: "Choose one of the supported billing currencies." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any;
  const { data, error } = await db
    .from("profiles")
    .update({
      billing_currency: billingCurrency,
      billing_currency_selected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.user.id)
    .select("billing_currency, billing_currency_selected_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Could not save your billing currency." }, { status: 500 });
  }

  const next = clientDashboardPath(account.profile.public_user_id, safeClientPath(body?.next));
  return setClientDashboardSessionOnResponse(
    NextResponse.json({ ok: true, currency: data.billing_currency, next }),
    account.user,
  );
}
