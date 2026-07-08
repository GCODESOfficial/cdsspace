/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { listResourceVersions, recordResourceVersion } from "@/lib/admin-versioning";
import { logActivity } from "@/lib/activity-log";

const RESTORABLE_QUOTATION_COLUMNS = [
  "project_id",
  "milestone_id",
  "project_name",
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
  "valid_until",
  "notes",
  "estimate_note",
  "revisions_note",
  "working_hours",
  "delivery_period",
] as const;

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "finance_quotations");
  if (denied) return denied;

  const { id } = await params;
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") || 30);
  const { versions, error } = await listResourceVersions("quotation", id, limit);

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ versions });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "finance_quotations.edit");
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
    .eq("resource_type", "quotation")
    .eq("resource_id", id)
    .maybeSingle();

  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 });
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const targetQuotation = version.before_data?.quotation;
  const targetItems = Array.isArray(version.before_data?.items) ? version.before_data.items : [];
  const targetSamples = Array.isArray(version.before_data?.samples) ? version.before_data.samples : [];
  if (!targetQuotation) {
    return NextResponse.json({ error: "Selected version has no quotation snapshot to restore." }, { status: 400 });
  }

  const current = await getQuotationSnapshot(sb, id);
  if (!current.quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  for (const key of RESTORABLE_QUOTATION_COLUMNS) {
    if (key in targetQuotation) patch[key] = targetQuotation[key];
  }

  const { data: restoredQuotation, error: restoreError } = await sb
    .from("finance_quotations")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (restoreError) return NextResponse.json({ error: restoreError.message }, { status: 500 });

  await sb.from("finance_quotation_items").delete().eq("quotation_id", id);
  if (targetItems.length > 0) {
    const rows = targetItems.map((item: any, index: number) => ({
      quotation_id: id,
      name: item.name,
      description: item.description ?? null,
      quantity: Number(item.quantity ?? 1),
      unit_price: Number(item.unit_price ?? 0),
      total: Number(item.total ?? Number(item.quantity ?? 1) * Number(item.unit_price ?? 0)),
      position: Number.isFinite(Number(item.position)) ? Number(item.position) : index,
    }));
    const { error: itemError } = await sb.from("finance_quotation_items").insert(rows);
    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  await sb.from("finance_quotation_samples").delete().eq("quotation_id", id);
  if (targetSamples.length > 0) {
    const rows = targetSamples
      .filter((sample: any) => sample?.url)
      .map((sample: any, index: number) => ({
        quotation_id: id,
        kind: sample.kind === "image" ? "image" : "link",
        url: sample.url,
        label: sample.label ?? null,
        position: Number.isFinite(Number(sample.position)) ? Number(sample.position) : index,
      }));
    if (rows.length > 0) {
      const { error: sampleError } = await sb.from("finance_quotation_samples").insert(rows);
      if (sampleError) return NextResponse.json({ error: sampleError.message }, { status: 500 });
    }
  }

  const after = await getQuotationSnapshot(sb, id);
  const resourceLabel = `${restoredQuotation?.quotation_number || id} - ${restoredQuotation?.project_name || ""} - ${restoredQuotation?.client_name || ""}`.trim();
  const metadata = {
    version_id: versionId,
    restored_from_action: version.action,
    restored_from_created_at: version.created_at,
  };

  await logActivity({
    action: "quotation.restore_version",
    page: "finance/quotations",
    resource_type: "quotation",
    resource_id: id,
    resource_label: resourceLabel,
    metadata,
  });
  await recordResourceVersion({
    action: "quotation.restore_version",
    page: "finance/quotations",
    resource_type: "quotation",
    resource_id: id,
    resource_label: resourceLabel,
    before_data: current,
    after_data: after,
    metadata,
  });

  return NextResponse.json({ quotation: after.quotation, items: after.items, samples: after.samples });
}
