import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { logActivity } from "@/lib/activity-log";

export async function GET(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req); if (denied) return denied;
  const sb = financeDb();
  const { data, error } = await sb.from("finance_expenditures").select("*").order("spent_on", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expenditures: data ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req); if (denied) return denied;
  const body = await req.json();
  const { title, category, amount, currency = "NGN", spent_on, recurring = false, recurrence_cycle, custom_interval_days, next_due_date, notes } = body;
  if (!title || amount == null) return NextResponse.json({ error: "title and amount required" }, { status: 400 });
  const sb = financeDb();
  const { data, error } = await sb.from("finance_expenditures").insert({
    title, category: category || null, amount: Number(amount), currency,
    spent_on: spent_on || new Date().toISOString().slice(0, 10),
    recurring, recurrence_cycle: recurring ? recurrence_cycle : null,
    custom_interval_days: recurring && recurrence_cycle === "custom" ? Number(custom_interval_days || 0) : null,
    next_due_date: next_due_date || null, notes: notes || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep the suggestion tables in sync so future entries pick up this value.
  // Fire-and-forget - don't let a failure here block the expenditure insert.
  const bumpSuggestion = async (table: string, name: string) => {
    try {
      const { data: existing } = await sb.from(table).select("id, usage_count").ilike("name", name).maybeSingle();
      if (existing) {
        await sb.from(table)
          .update({ usage_count: (existing.usage_count ?? 0) + 1, last_used_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await sb.from(table).insert({ name, usage_count: 1 });
      }
    } catch { /* non-blocking */ }
  };
  await Promise.all([
    bumpSuggestion("finance_expenditure_titles", String(title).trim()),
    category ? bumpSuggestion("finance_expenditure_categories", String(category).trim()) : Promise.resolve(),
  ]);

  await logActivity({
    action: "expenditure.create",
    page: "finance/expenditures",
    resource_type: "expenditure",
    resource_id: data?.id,
    resource_label: `${title} · ${currency} ${Number(amount).toLocaleString()}`,
    metadata: { category, recurring },
  });

  return NextResponse.json({ expenditure: data });
}
