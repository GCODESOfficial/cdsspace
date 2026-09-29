/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { denyPaidInvoiceEdit } from "@/lib/finance/paid-invoice-lock";
import { listResourceVersions, recordResourceVersion } from "@/lib/admin-versioning";
import { logActivity } from "@/lib/activity-log";

const RESTORABLE_INVOICE_COLUMNS = [
  "project_id",
  "milestone_id",
  "client_name",
  "client_email",
  "client_address",
  "currency",
  "subtotal",
  "tax_rate",
  "tax_amount",
  "discount",
  "total",
  "status",
  "scope",
  "period_month",
  "issue_date",
  "due_date",
  "notes",
  "payment_terms",
  "revisions_note",
  "working_hours",
  "delivery_speed",
  "delivery_period",
] as const;

async function getInvoiceSnapshot(sb: any, id: string) {
  const { data: invoice, error } = await sb
    .from("finance_invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !invoice) return { invoice: null, items: [] };
  const { data: items } = await sb
    .from("finance_invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("position");
  return { invoice, items: items ?? [] };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "finance_invoices");
  if (denied) return denied;

  const { id } = await params;
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") || 30);
  const { versions, error } = await listResourceVersions("invoice", id, limit);

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ versions });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "finance_invoices.edit");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const versionId = body?.version_id;
  if (!versionId) return NextResponse.json({ error: "version_id required" }, { status: 400 });

  const sb = financeDb();
  const { data: version, error: versionError } = await sb
    .from("admin_resource_versions")
    .select("*")
    .eq("id", versionId)
    .eq("resource_type", "invoice")
    .eq("resource_id", id)
    .maybeSingle();

  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 });
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const targetInvoice = version.before_data?.invoice;
  const targetItems = Array.isArray(version.before_data?.items) ? version.before_data.items : [];
  if (!targetInvoice) {
    return NextResponse.json({ error: "Selected version has no invoice snapshot to restore." }, { status: 400 });
  }

  const current = await getInvoiceSnapshot(sb, id);
  if (!current.invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const locked = await denyPaidInvoiceEdit(req, current.invoice);
  if (locked) return locked;

  const patch: Record<string, unknown> = {};
  for (const key of RESTORABLE_INVOICE_COLUMNS) {
    if (key in targetInvoice) patch[key] = targetInvoice[key];
  }

  const { data: restoredInvoice, error: restoreError } = await sb
    .from("finance_invoices")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (restoreError) return NextResponse.json({ error: restoreError.message }, { status: 500 });

  await sb.from("finance_invoice_items").delete().eq("invoice_id", id);
  if (targetItems.length > 0) {
    const rows = targetItems.map((item: any, index: number) => ({
      invoice_id: id,
      name: item.name,
      description: item.description ?? null,
      quantity: Number(item.quantity ?? 1),
      unit_price: Number(item.unit_price ?? 0),
      total: Number(item.total ?? Number(item.quantity ?? 1) * Number(item.unit_price ?? 0)),
      position: Number.isFinite(Number(item.position)) ? Number(item.position) : index,
    }));
    const { error: itemError } = await sb.from("finance_invoice_items").insert(rows);
    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  const after = await getInvoiceSnapshot(sb, id);
  const resourceLabel = `${restoredInvoice?.invoice_number || id} · ${restoredInvoice?.client_name || ""}`.trim();
  const metadata = {
    version_id: versionId,
    restored_from_action: version.action,
    restored_from_created_at: version.created_at,
  };

  await logActivity({
    action: "invoice.restore_version",
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: id,
    resource_label: resourceLabel,
    metadata,
  });
  await recordResourceVersion({
    action: "invoice.restore_version",
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: id,
    resource_label: resourceLabel,
    before_data: current,
    after_data: after,
    metadata,
  });

  return NextResponse.json({ invoice: after.invoice, items: after.items });
}
