/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { generateQuotationNumber, randomToken, DEFAULT_QUOTATION_ESTIMATE_NOTE } from "@/lib/finance/types";
import { logActivity } from "@/lib/activity-log";
import { recordResourceVersion } from "@/lib/admin-versioning";

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

export async function GET(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req, "finance_quotations");
  if (denied) return denied;

  const sb = financeDb();
  const { data, error } = await sb
    .from("finance_quotations")
    .select("*, finance_projects(name, client)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ quotations: data ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req, "finance_quotations.create");
  if (denied) return denied;

  const body = await req.json();
  const {
    project_id = null,
    milestone_id = null,
    project_name,
    client_name,
    client_email,
    client_address,
    currency = "NGN",
    tax_rate = 0,
    discount = 0,
    status = "draft",
    scope = "custom",
    period_month = null,
    issue_date,
    valid_until,
    notes,
    estimate_note = DEFAULT_QUOTATION_ESTIMATE_NOTE,
    revisions_note,
    working_hours,
    delivery_period = null,
    items = [],
    samples = [],
  } = body;

  if (!project_name?.trim()) return NextResponse.json({ error: "project_name required" }, { status: 400 });
  if (!client_name?.trim()) return NextResponse.json({ error: "client_name required" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "at least one item required" }, { status: 400 });

  const subtotal = items.reduce((s: number, it: { quantity: number; unit_price: number }) => s + Number(it.quantity) * Number(it.unit_price), 0);
  const tax_amount = (subtotal - Number(discount || 0)) * (Number(tax_rate || 0) / 100);
  const total = subtotal - Number(discount || 0) + tax_amount;

  const quotation_number = generateQuotationNumber();
  const public_token = randomToken(28);
  const sb = financeDb();

  const insertPayload = {
    quotation_number,
    project_id,
    milestone_id,
    project_name: project_name.trim(),
    client_name: client_name.trim(),
    client_email: client_email || null,
    client_address: client_address || null,
    currency,
    subtotal,
    tax_rate,
    tax_amount,
    discount,
    total,
    status,
    scope,
    period_month,
    issue_date: issue_date || new Date().toISOString().slice(0, 10),
    valid_until: valid_until || null,
    notes: notes || null,
    estimate_note: estimate_note || DEFAULT_QUOTATION_ESTIMATE_NOTE,
    revisions_note: revisions_note || null,
    working_hours: working_hours || null,
    delivery_period: delivery_period || null,
    public_token,
  };

  const { data: quotation, error } = await sb
    .from("finance_quotations")
    .insert(insertPayload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const itemRows = items.map((it: { name: string; description?: string; quantity: number; unit_price: number }, idx: number) => ({
    quotation_id: quotation.id,
    name: it.name,
    description: it.description || null,
    quantity: Number(it.quantity),
    unit_price: Number(it.unit_price),
    total: Number(it.quantity) * Number(it.unit_price),
    position: idx,
  }));
  const { error: itemError } = await sb.from("finance_quotation_items").insert(itemRows);
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });

  const sampleRows = cleanSamples(Array.isArray(samples) ? samples : []).map((sample: any) => ({
    ...sample,
    quotation_id: quotation.id,
  }));
  if (sampleRows.length > 0) {
    const { error: sampleError } = await sb.from("finance_quotation_samples").insert(sampleRows);
    if (sampleError) return NextResponse.json({ error: sampleError.message }, { status: 500 });
  }

  const names = items.map((it: { name: string }) => it.name).filter(Boolean);
  if (names.length > 0) {
    const { data: existing } = await sb.from("finance_price_items").select("name").in("name", names);
    const existingNames = new Set((existing ?? []).map((x: { name: string }) => x.name.toLowerCase()));
    const toSave = items
      .filter((it: { name: string; isNew?: boolean }) => it.isNew && !existingNames.has(it.name.toLowerCase()))
      .map((it: { name: string; description?: string; unit_price: number }) => ({
        name: it.name,
        description: it.description || null,
        unit_price: Number(it.unit_price),
        currency,
        category: null,
      }));
    if (toSave.length > 0) await sb.from("finance_price_items").insert(toSave);
  }

  const resourceLabel = `${quotation.quotation_number} - ${quotation.project_name} - ${quotation.client_name}`;
  const after = { quotation, items: itemRows, samples: sampleRows };
  await logActivity({
    action: "quotation.create",
    page: "finance/quotations",
    resource_type: "quotation",
    resource_id: quotation.id,
    resource_label: resourceLabel,
    metadata: { total: quotation.total, currency: quotation.currency, status: quotation.status },
  });
  await recordResourceVersion({
    action: "quotation.create",
    page: "finance/quotations",
    resource_type: "quotation",
    resource_id: quotation.id,
    resource_label: resourceLabel,
    before_data: {},
    after_data: after,
    metadata: { total: quotation.total, currency: quotation.currency, status: quotation.status },
  });

  return NextResponse.json({ quotation });
}
