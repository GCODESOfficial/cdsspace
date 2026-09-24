import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { CURRENCIES, formatMoney, generateInvoiceNumber, randomToken } from "@/lib/finance/types";
import { isMissingInvoiceExtensionColumn, stripInvoiceExtensionFields } from "@/lib/finance/invoice-schema-fallback";
import { logActivity } from "@/lib/activity-log";
import { recordResourceVersion } from "@/lib/admin-versioning";
import { resolveClientBillingCurrency } from "@/lib/client-billing-server";
import { INVOICE_VALID_DAYS } from "@/lib/finance/invoice-expiry";

export async function GET(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req, "finance_invoices"); if (denied) return denied;
  const sb = financeDb();
  const archived = new URL(req.url).searchParams.get("archived") === "1";
  let query = sb
    .from("finance_invoices")
    .select("*, finance_projects(name, client), invoice_payment_submissions(id, status, submitted_at, method, amount, currency, transfer_reference)");
  query = archived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const invoices = [...(data ?? [])].sort((a: any, b: any) => {
    const aPending = (a.invoice_payment_submissions || []).some((entry: any) => entry.status === "pending") ? 1 : 0;
    const bPending = (b.invoice_payment_submissions || []).some((entry: any) => entry.status === "pending") ? 1 : 0;
    return bPending - aPending || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return NextResponse.json({ invoices });
}

export async function POST(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req, "finance_invoices.create"); if (denied) return denied;
  const body = await req.json();
  const isAutosave = req.headers.get("x-cds-silent") === "1";
  const isFinalSave = body?.finalize === true && !isAutosave;
  const {
    project_id = null, milestone_id = null, client_name, client_email, client_address,
    currency: requestedCurrency = "NGN", tax_rate = 0, discount = 0, status = "draft",
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
  if (isFinalSave && total <= 0) {
    return NextResponse.json({ error: "Add a positive invoice amount before saving." }, { status: 400 });
  }

  const invoice_number = generateInvoiceNumber();
  const public_token = randomToken(28);
  // A new invoice is valid for 28 days from issue. Invoices raised before this
  // rule carry no expiry and are left alone, since nobody told those clients
  // of a deadline.
  const issuedOn = issue_date || new Date().toISOString().slice(0, 10);
  const auto_cancel_at = new Date(
    new Date(`${issuedOn}T00:00:00.000Z`).getTime() + INVOICE_VALID_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const sb = financeDb();
  const requestedCurrencyCode = CURRENCIES.includes(String(requestedCurrency).toUpperCase() as (typeof CURRENCIES)[number])
    ? String(requestedCurrency).toUpperCase()
    : "NGN";
  const currency = await resolveClientBillingCurrency(sb, client_email, requestedCurrencyCode);
  const insertPayload = {
    invoice_number, project_id, milestone_id, client_name,
    client_email: client_email || null, client_address: client_address || null,
    currency, subtotal, tax_rate, tax_amount, discount, total,
    status, scope, period_month,
    issue_date: issuedOn,
    auto_cancel_at,
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
  const { error: itemError } = await sb.from("finance_invoice_items").insert(itemRows);
  if (itemError) {
    // Treat the header and line items as one logical save. Removing this new,
    // incomplete row prevents an orphaned zero-detail invoice from appearing.
    await sb.from("finance_invoices").delete().eq("id", invoice.id);
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

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

  const action = isFinalSave ? "invoice.create" : "invoice.draft_saved";
  const activityMetadata = {
    "Invoice": invoice.invoice_number,
    "Client": invoice.client_name,
    "Client email": invoice.client_email,
    "Client address": invoice.client_address,
    "Issue date": invoice.issue_date,
    "Due date": invoice.due_date,
    "Line items": itemRows.length,
    "Items": itemRows.map((item: { name: string; quantity: number; total: number }) => `${item.name} × ${item.quantity} (${formatMoney(item.total, invoice.currency)})`).join("; "),
    "Subtotal": formatMoney(invoice.subtotal, invoice.currency),
    "Discount": formatMoney(invoice.discount, invoice.currency),
    "Tax": formatMoney(invoice.tax_amount, invoice.currency),
    "Total": formatMoney(invoice.total, invoice.currency),
    "Currency": invoice.currency,
    "Status": invoice.status,
    "Payment terms": invoice.payment_terms,
  };
  await logActivity({
    action,
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: invoice.id,
    resource_label: `${invoice.invoice_number} · ${client_name}`,
    metadata: activityMetadata,
  });
  await recordResourceVersion({
    action,
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: invoice.id,
    resource_label: `${invoice.invoice_number} · ${client_name}`,
    before_data: {},
    after_data: { invoice, items: itemRows },
    metadata: activityMetadata,
  });

  return NextResponse.json({ invoice });
}
