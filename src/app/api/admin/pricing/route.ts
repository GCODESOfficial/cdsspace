import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { financeDb } from "@/lib/finance/api-auth";
import { CLIENT_BILLING_CURRENCIES } from "@/lib/client-billing";
import { INDUSTRY_CATEGORIES } from "@/lib/industry-categories";
import {
  isSubscriptionPlanId,
  SUBSCRIPTION_PLAN_IDS,
  SUBSCRIPTION_PRICE_COLUMNS,
} from "@/lib/subscription-plans";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { denied } = await requireAdmin(request, "pricing.view");
  if (denied) return denied;

  const { data, error } = await financeDb()
    .from("plan_pricing")
    .select("*")
    .order("industry")
    .order("plan");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pricing: data || [] });
}

export async function PUT(request: NextRequest) {
  const { denied } = await requireAdmin(request, "pricing.edit");
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: "Pricing rows are required." }, { status: 400 });
  }

  const allowedIndustries = new Set<string>(INDUSTRY_CATEGORIES);
  const unique = new Map<string, Record<string, unknown>>();
  for (const input of body.rows) {
    const plan = input?.plan;
    const industry = String(input?.industry || "").trim();
    if (!isSubscriptionPlanId(plan) || !allowedIndustries.has(industry)) {
      return NextResponse.json({ error: "A pricing row contains an invalid plan or industry." }, { status: 400 });
    }

    const row: Record<string, unknown> = { plan, industry, updated_at: new Date().toISOString() };
    for (const currency of CLIENT_BILLING_CURRENCIES) {
      const column = SUBSCRIPTION_PRICE_COLUMNS[currency];
      const value = Number(input?.[column] || 0);
      if (!Number.isFinite(value) || value < 0 || value > 999_999_999) {
        return NextResponse.json({ error: `Invalid ${currency} price for ${plan}.` }, { status: 400 });
      }
      row[column] = Math.round(value * 100) / 100;
    }
    unique.set(`${plan}:${industry}`, row);
  }

  const expected = SUBSCRIPTION_PLAN_IDS.length * INDUSTRY_CATEGORIES.length;
  if (unique.size !== expected) {
    return NextResponse.json({ error: `Expected ${expected} complete plan pricing rows.` }, { status: 400 });
  }

  const { data, error } = await financeDb()
    .from("plan_pricing")
    .upsert([...unique.values()], { onConflict: "plan,industry" })
    .select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pricing: data || [] });
}
