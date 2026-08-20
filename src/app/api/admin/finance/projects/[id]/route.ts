import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req);
  if (denied) return denied;
  const { id } = await params;
  const sb = financeDb();
  const { data: project, error } = await sb.from("finance_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  const { data: milestones } = await sb
    .from("finance_milestones")
    .select("*")
    .eq("project_id", id)
    .order("position", { ascending: true });
  return NextResponse.json({ project, milestones: milestones ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const allowed = ["name", "client", "client_email", "currency", "duration_start", "duration_end", "status", "notes"];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (k in body) patch[k] = body[k];
  const sb = financeDb();
  const { data, error } = await sb.from("finance_projects").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req);
  if (denied) return denied;
  const { id } = await params;
  const sb = financeDb();
  const { error } = await sb.from("finance_projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
