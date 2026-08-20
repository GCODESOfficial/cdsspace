/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { logActivity } from "@/lib/activity-log";
import { recordResourceVersion } from "@/lib/admin-versioning";
import { resolveClientBillingCurrency } from "@/lib/client-billing-server";
import { CURRENCIES } from "@/lib/finance/types";

async function getQuotationSnapshot(sb: any, id: string) {
  const { data: quotation, error } = await sb
    .from("finance_quotations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !quotation) return { quotation: null, items: [], samples: [] };

  const [{ data: items }, { data: samples }] = await Promise.all([
    sb.from("finance_quotation_items").select("*").eq("quotation_id", id).order("position"),
    sb.from("finance_quotation_samples").select("*").eq("quotation_id", id).order("position"),
  ]);
  return { quotation, items: items ?? [], samples: samples ?? [] };
}

function cleanSamples(samples: unknown[]) {
  return samples
    .filter((sample): sample is Record<string, unknown> => Boolean(sample && typeof sample === "object"))
    .map((sample, idx) => {
      const url = String(sample.url || "").trim();
      if (!url) return null;
      return {
        kind: sample.kind === "image" ? "image" : "link",
        url,
        label: sample.label ? String(sample.label).trim() : null,
        position: Number.isFinite(Number(sample.position)) ? Number(sample.position) : idx,
      };
    })
    .filter(Boolean);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "finance_quotations");
  if (denied) return denied;

  const { id } = await params;
  const sb = financeDb();
  const { data: quotation, error } = await sb
    .from("finance_quotations")
    .select("*, finance_projects(name, client)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const [{ data: items }, { data: samples }] = await Promise.all([
    sb.from("finance_quotation_items").select("*").eq("quotation_id", id).order("position"),
    sb.from("finance_quotation_samples").select("*").eq("quotation_id", id).order("position"),
  ]);

  return NextResponse.json({ quotation, items: items ?? [], samples: samples ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "finance_quotations.edit");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const allowed = [
    "status",
    "project_id",
    "milestone_id",
    "project_name",
    "client_name",
    "client_email",
    "client_address",
    "currency",
    "tax_rate",
    "discount",
    "scope",
    "period_month",
    "issue_date",
    "valid_until",
    "notes",
    "estimate_note",
    "revisions_note",
    "working_hours",
    "delivery_period",
  ];

  const patch: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) patch[key] = body[key];

  const sb = financeDb();
  const before = await getQuotationSnapshot(sb, id);
  if (!before.quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  if ("currency" in body || "client_email" in body) {
    const requestedCurrency = CURRENCIES.includes(String(body.currency || before.quotation.currency).toUpperCase() as (typeof CURRENCIES)[number])
      ? String(body.currency || before.quotation.currency).toUpperCase()
      : String(before.quotation.currency || "NGN");
    patch.currency = await resolveClientBillingCurrency(
      sb,
      body.client_email ?? before.quotation.client_email,
      requestedCurrency,
    );
  }

  if (body.items && Array.isArray(body.items)) {
    const subtotal = body.items.reduce((s: number, it: { quantity: number; unit_price: number }) => s + Number(it.quantity) * Number(it.unit_price), 0);
    const tax_rate = Number(body.tax_rate ?? patch.tax_rate ?? before.quotation.tax_rate ?? 0);
    const discount = Number(body.discount ?? patch.discount ?? before.quotation.discount ?? 0);
    const tax_amount = (subtotal - discount) * (tax_rate / 100);
    const total = subtotal - discount + tax_amount;
    patch.subtotal = subtotal;
    patch.tax_amount = tax_amount;
    patch.total = total;
  }

  let data;
  let error;
  if (Object.keys(patch).length > 0) {
    ({ data, error } = await sb
      .from("finance_quotations")
      .update(patch)
      .eq("id", id)
      .select()
      .single());
  } else {
    ({ data, error } = await sb
      .from("finance_quotations")
      .select("*")
      .eq("id", id)
      .single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.items && Array.isArray(body.items)) {
    await sb.from("finance_quotation_items").delete().eq("quotation_id", id);
    const itemRows = body.items.map((it: any, idx: number) => ({
      quotation_id: id,
      name: it.name,
      description: it.description || null,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      total: Number(it.quantity) * Number(it.unit_price),
      position: idx,
    }));
    if (itemRows.length > 0) {
      const { error: itemError } = await sb.from("finance_quotation_items").insert(itemRows);
      if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
    }
  }

  if (Array.isArray(body.samples)) {
    await sb.from("finance_quotation_samples").delete().eq("quotation_id", id);
    const sampleRows = cleanSamples(body.samples).map((sample: any) => ({
      ...sample,
      quotation_id: id,
    }));
    if (sampleRows.length > 0) {
      const { error: sampleError } = await sb.from("finance_quotation_samples").insert(sampleRows);
      if (sampleError) return NextResponse.json({ error: sampleError.message }, { status: 500 });
    }
  }

  const after = await getQuotationSnapshot(sb, id);
  const action = patch.status === "sent"
    ? "quotation.send"
    : patch.status === "accepted"
      ? "quotation.accept"
      : "quotation.update";
  const resourceLabel = `${data?.quotation_number || id} - ${data?.project_name || ""} - ${data?.client_name || ""}`.trim();

  await logActivity({
    action,
    page: "finance/quotations",
    resource_type: "quotation",
    resource_id: id,
    resource_label: resourceLabel,
    metadata: { patch },
  });
  await recordResourceVersion({
    action,
    page: "finance/quotations",
    resource_type: "quotation",
    resource_id: id,
    resource_label: resourceLabel,
    before_data: before,
    after_data: after,
    metadata: { patch },
  });

  return NextResponse.json({ quotation: after.quotation, items: after.items, samples: after.samples });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "finance_quotations.delete");
  if (denied) return denied;

  const { id } = await params;
  const sb = financeDb();
  const before = await getQuotationSnapshot(sb, id);
  const { error } = await sb.from("finance_quotations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resourceLabel = `${before.quotation?.quotation_number || id} - ${before.quotation?.project_name || ""} - ${before.quotation?.client_name || ""}`.trim();
  await logActivity({
    action: "quotation.delete",
    page: "finance/quotations",
    resource_type: "quotation",
    resource_id: id,
    resource_label: resourceLabel,
  });
  await recordResourceVersion({
    action: "quotation.delete",
    page: "finance/quotations",
    resource_type: "quotation",
    resource_id: id,
    resource_label: resourceLabel,
    before_data: before,
    after_data: null,
  });

  return NextResponse.json({ ok: true });
}
