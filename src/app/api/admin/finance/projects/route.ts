import { NextRequest, NextResponse } from "next/server";
import { callerSeesClientIdentity, financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { maskClientRows } from "@/lib/client-identity";
import { ensureProjectChannel } from "@/lib/team-chat-channels";
import { resolveClientBillingCurrency } from "@/lib/client-billing-server";
import { CURRENCIES } from "@/lib/finance/types";

export async function GET(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req);
  if (denied) return denied;
  const sb = financeDb();
  const { data, error } = await sb
    .from("finance_projects")
    .select("*, finance_milestones(id, budget, paid_amount, status)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // compute totals per project
  const projects = (data ?? []).map((p: any) => {
    const ms = p.finance_milestones ?? [];
    const total_budget = ms.reduce((s: number, m: any) => s + Number(m.budget || 0), 0);
    const total_paid = ms.reduce((s: number, m: any) => s + Number(m.paid_amount || 0), 0);
    return { ...p, total_budget, total_paid, milestone_count: ms.length };
  });
  // Masked here rather than in the page: a name an admin may not see must not
  // travel to their browser at all.
  return NextResponse.json({ projects: maskClientRows(projects, await callerSeesClientIdentity(req)) });
}

export async function POST(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const client = String(body?.client ?? "").trim();
  const requestedCurrency = String(body?.currency ?? "").trim().toUpperCase();
  const clientEmail = String(body?.client_email ?? "").trim().toLowerCase();
  const { duration_start, duration_end, notes } = body ?? {};
  if (!name || !client || !requestedCurrency) {
    return NextResponse.json({ error: "Project name, client and currency are required." }, { status: 400 });
  }
  if (!CURRENCIES.includes(requestedCurrency as (typeof CURRENCIES)[number])) {
    return NextResponse.json({ error: "invalid currency" }, { status: 400 });
  }
  const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const start = isDate(duration_start) ? duration_start : null;
  const end = isDate(duration_end) ? duration_end : null;
  if (start && end && end < start) {
    return NextResponse.json({ error: "Project end date cannot be before the start date." }, { status: 400 });
  }
  const sb = financeDb();
  const currency = await resolveClientBillingCurrency(sb, clientEmail, requestedCurrency);
  const { data, error } = await sb
    .from("finance_projects")
    .insert({ name, client, client_email: clientEmail || null, currency, duration_start: start, duration_end: end, notes: (typeof notes === "string" && notes.trim()) || null })
    .select()
    .single();
  if (error) {
    console.error("[finance/projects] create failed:", error.message);
    return NextResponse.json({ error: "Could not create the project. Please check the details and try again." }, { status: 500 });
  }

  // Auto-create the project's team chat room (best-effort, never blocks).
  await ensureProjectChannel(data.id).catch(() => null);

  return NextResponse.json({ project: data });
}
