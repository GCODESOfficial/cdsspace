import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { generateInvoiceNumber, randomToken } from "@/lib/finance/types";
import { isMissingInvoiceExtensionColumn, stripInvoiceExtensionFields } from "@/lib/finance/invoice-schema-fallback";
import { logActivity } from "@/lib/activity-log";
import { recordResourceVersion } from "@/lib/admin-versioning";

export async function GET(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req, "finance_invoices"); if (denied) return denied;
  const sb = financeDb();
  const { data, error } = await sb
    .from("finance_invoices")
    .select("*, finance_projects(name, client)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoices: data ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req, "finance_invoices.create"); if (denied) return denied;
  const body = await req.json();
  const {
    project_id = null, milestone_id = null, client_name, client_email, client_address,
    currency = "NGN", tax_rate = 0, discount = 0, status = "draft",
    scope = "custom", period_month = null, issue_date, due_date, notes,
    payment_terms, revisions_note, working_hours,
    delivery_speed = "standard", delivery_period = null,
    items = [],
  } = body;
  if (!client_name) return NextResponse.json({ error: "client_name required" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "at least one item required" }, { status: 400 });

  const subtotal = items.reduce((s: number, it: { quantity: number; unit_price: number }) => s + Number(it.quantity) * Number(it.unit_price), 0);
  const tax_amount = (subtotal - Number(discount || 0)) * (Number(tax_rate || 0) / 100);
  const total = subtotal - Number(discount || 0) + tax_amount;

  const invoice_number = generateInvoiceNumber();
  const public_token = randomToken(28);

  const sb = financeDb();
  const insertPayload = {
    invoice_number, project_id, milestone_id, client_name,
    client_email: client_email || null, client_address: client_address || null,
    currency, subtotal, tax_rate, tax_amount, discount, total,
    status, scope, period_month,
    issue_date: issue_date || new Date().toISOString().slice(0, 10),
    due_date: due_date || null, notes: notes || null, public_token,
    // NEW: terms + delivery (fall back to DB defaults if caller omits them)
    ...(payment_terms !== undefined ? { payment_terms } : {}),
    ...(revisions_note !== undefined ? { revisions_note } : {}),
    ...(working_hours !== undefined ? { working_hours } : {}),
    delivery_speed,
    delivery_period: delivery_period || null,
  };

  let { data: invoice, error } = await sb.from("finance_invoices").insert(insertPayload).select().single();
  if (error && isMissingInvoiceExtensionColumn(error)) {
    ({ data: invoice, error } = await sb
      .from("finance_invoices")
      .insert(stripInvoiceExtensionFields(insertPayload))
      .select()
      .single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Insert items + autosave any new ones to price list
  const itemRows = items.map((it: { name: string; description?: string; quantity: number; unit_price: number }, idx: number) => ({
    invoice_id: invoice.id,
    name: it.name,
    description: it.description || null,
    quantity: Number(it.quantity),
    unit_price: Number(it.unit_price),
    total: Number(it.quantity) * Number(it.unit_price),
    position: idx,
  }));
  await sb.from("finance_invoice_items").insert(itemRows);

  // Autosave: if any item name doesn't already exist in price list, save it
  const names = items.map((it: { name: string }) => it.name).filter(Boolean);
  if (names.length > 0) {
    const { data: existing } = await sb.from("finance_price_items").select("name").in("name", names);
    const existingNames = new Set((existing ?? []).map((x: { name: string }) => x.name.toLowerCase()));
    const toSave = items
      .filter((it: { name: string; isNew?: boolean }) => it.isNew && !existingNames.has(it.name.toLowerCase()))
      .map((it: { name: string; description?: string; unit_price: number }) => ({
        name: it.name, description: it.description || null,
        unit_price: Number(it.unit_price), currency, category: null,
      }));
    if (toSave.length > 0) await sb.from("finance_price_items").insert(toSave);
  }

  await logActivity({
    action: "invoice.create",
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: invoice.id,
    resource_label: `${invoice.invoice_number} · ${client_name}`,
    metadata: { total: invoice.total, currency: invoice.currency, status: invoice.status },
  });
  await recordResourceVersion({
    action: "invoice.create",
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: invoice.id,
    resource_label: `${invoice.invoice_number} · ${client_name}`,
    before_data: {},
    after_data: { invoice, items: itemRows },
    metadata: { total: invoice.total, currency: invoice.currency, status: invoice.status },
  });

  return NextResponse.json({ invoice });
}
