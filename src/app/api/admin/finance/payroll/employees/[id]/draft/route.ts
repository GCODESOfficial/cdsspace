import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { financeDb } from "@/lib/finance/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function actorId(session: { memberId?: string; email: string }) {
  return session.memberId || session.email.trim().toLowerCase();
}

async function authorised(req: NextRequest) {
  return requireAdmin(req, "finance_payroll.edit");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await authorised(req);
  if (denied || !session) {
    return denied ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const sb = financeDb();
  const { data, error } = await sb
    .from("finance_employee_edit_drafts")
    .select("payload, updated_at")
    .eq("employee_id", id)
    .eq("actor_id", actorId(session))
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Couldn't load the saved edit draft." }, { status: 500 });
  return NextResponse.json({ draft: data ?? null });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await authorised(req);
  if (denied || !session) {
    return denied ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
    return NextResponse.json({ error: "A valid edit draft is required." }, { status: 400 });
  }

  const serialized = JSON.stringify(body.payload);
  if (serialized.length > 20_000) {
    return NextResponse.json({ error: "The edit draft is too large." }, { status: 413 });
  }

  const sb = financeDb();
  const { data: employee, error: employeeError } = await sb
    .from("finance_employees")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (employeeError) return NextResponse.json({ error: "Couldn't verify the employee record." }, { status: 500 });
  if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const { data, error } = await sb
    .from("finance_employee_edit_drafts")
    .upsert({
      employee_id: id,
      actor_id: actorId(session),
      actor_name: session.name || session.email,
      payload: body.payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: "employee_id,actor_id" })
    .select("updated_at")
    .single();
  if (error) return NextResponse.json({ error: "Couldn't save the edit draft." }, { status: 500 });
  return NextResponse.json({ saved: true, updated_at: data.updated_at });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await authorised(req);
  if (denied || !session) {
    return denied ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const sb = financeDb();
  const { error } = await sb
    .from("finance_employee_edit_drafts")
    .delete()
    .eq("employee_id", id)
    .eq("actor_id", actorId(session));
  if (error) return NextResponse.json({ error: "Couldn't discard the edit draft." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
