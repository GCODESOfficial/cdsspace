import { NextRequest, NextResponse } from "next/server";
import { financeDb } from "@/lib/finance/api-auth";
import { requireAdmin } from "@/lib/admin-api-auth";
import { CURRENCIES } from "@/lib/finance/types";
import { logActivity } from "@/lib/activity-log";

const EDITABLE_TEXT_FIELDS = [
  "role",
  "email",
  "phone",
  "bank_name",
  "bank_code",
  "account_number",
  "account_name",
] as const;

function validDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function actorId(session: { memberId?: string; email: string }) {
  return session.memberId || session.email.trim().toLowerCase();
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireAdmin(req, "finance_payroll.edit");
  if (denied || !session) {
    return denied ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A valid employee edit is required." }, { status: 400 });
  }

  const reason = typeof body.edit_reason === "string" ? body.edit_reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "Enter the reason this payroll edit was approved." }, { status: 400 });
  }
  if (reason.length > 1000) {
    return NextResponse.json({ error: "The edit reason must be 1000 characters or fewer." }, { status: 400 });
  }
  if (!validDateOnly(body.approval_date)) {
    return NextResponse.json({ error: "Enter a valid approval date." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Employee name is required." }, { status: 400 });
    patch.name = name.slice(0, 200);
  }
  for (const field of EDITABLE_TEXT_FIELDS) {
    if (field in body) {
      patch[field] = typeof body[field] === "string" && body[field].trim()
        ? body[field].trim().slice(0, 500)
        : null;
    }
  }
  if ("base_salary" in body) {
    if (body.base_salary === null || body.base_salary === "") {
      patch.base_salary = null;
    } else {
      const salary = Number(body.base_salary);
      if (!Number.isFinite(salary) || salary < 0 || salary >= 1_000_000_000_000) {
        return NextResponse.json({ error: "Enter a valid salary amount." }, { status: 400 });
      }
      patch.base_salary = salary;
    }
  }
  if ("currency" in body) {
    if (!CURRENCIES.includes(body.currency)) {
      return NextResponse.json({ error: "Select a supported salary currency." }, { status: 400 });
    }
    patch.currency = body.currency;
  }
  if ("active" in body) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "Employee status must be true or false." }, { status: 400 });
    }
    patch.active = body.active;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No employee changes were provided." }, { status: 400 });
  }

  const sb = financeDb();
  const { data: current, error: currentError } = await sb
    .from("finance_employees")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: "Couldn't load the employee record." }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const changedFields = Object.keys(patch).filter((field) => {
    const previous = current[field];
    const next = patch[field];
    if (field === "base_salary") return Number(previous ?? 0) !== Number(next ?? 0) || (previous == null) !== (next == null);
    return (previous ?? null) !== (next ?? null);
  });
  if (changedFields.length === 0) {
    return NextResponse.json({ error: "Change at least one employee payroll detail." }, { status: 400 });
  }

  const editorId = actorId(session);
  const { data, error } = await sb.rpc("update_finance_employee_with_approval", {
    p_employee_id: id,
    p_patch: patch,
    p_reason: reason,
    p_approved_on: body.approval_date,
    p_actor_id: editorId,
    p_actor_name: session.name || session.email,
    p_changed_fields: changedFields,
  });
  if (error) {
    if (error.code === "P0002") return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    return NextResponse.json({ error: "Couldn't save the approved payroll edit." }, { status: 500 });
  }

  const employee = data?.employee ?? data;
  await logActivity({
    action: "payroll_employee.update",
    page: "finance/payroll",
    resource_type: "finance_employee",
    resource_id: id,
    resource_label: employee?.name || current.name,
    metadata: {
      reason,
      approved_on: body.approval_date,
      changed_fields: changedFields.join(", "),
      previous_salary: changedFields.includes("base_salary")
        ? `${current.currency} ${Number(current.base_salary ?? 0).toLocaleString()}`
        : undefined,
      new_salary: changedFields.includes("base_salary")
        ? `${employee?.currency || patch.currency || current.currency} ${Number(employee?.base_salary ?? patch.base_salary ?? 0).toLocaleString()}`
        : undefined,
    },
  });

  return NextResponse.json({ employee, edit_id: data?.edit_id });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin(req, "finance_payroll.delete");
  if (denied) return denied;
  const { id } = await params;
  const sb = financeDb();
  const { error } = await sb.from("finance_employees").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
