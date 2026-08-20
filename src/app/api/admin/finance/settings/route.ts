import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { isFinanceCurrency } from "@/lib/finance/currency-display";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "finance");
  if (denied) return denied;
  const { data, error } = await financeDb().from("finance_preferences").select("*").eq("id", "global").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function PATCH(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "finance");
  if (denied) return denied;
  const session = await getAdminSessionAsync(request);
  const body = await request.json().catch(() => ({}));
  if (!isFinanceCurrency(body.display_currency)) {
    return NextResponse.json({ error: "Choose a supported finance currency." }, { status: 400 });
  }
  const { data, error } = await financeDb().from("finance_preferences").upsert({
    id: "global",
    display_currency: body.display_currency,
    updated_at: new Date().toISOString(),
    updated_by: session?.email || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity({ action: "finance.display_currency.update", page: "finance", resource_type: "finance_preferences", resource_id: "global", resource_label: body.display_currency });
  return NextResponse.json({ settings: data });
}

