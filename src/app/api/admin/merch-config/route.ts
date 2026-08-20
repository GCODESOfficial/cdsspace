import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { normalizeMerchPrices } from "@/lib/merch-commerce";

export const dynamic = "force-dynamic";

function validUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function variants(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const list = (entry: unknown) => Array.isArray(entry) ? entry.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 50) : [];
  return { sizes: list(source.sizes), colors: list(source.colors) };
}

async function readConfig() {
  const db = financeDb();
  const { data, error } = await db.from("merch_products").select("*").order("sort_order").order("name");
  if (error) throw error;
  const products = await Promise.all((data || []).map(async (product: Record<string, unknown>) => {
    const path = typeof product.presentation_image_path === "string" ? product.presentation_image_path : null;
    const { data: signed } = path ? await db.storage.from("sales-commerce").createSignedUrl(path, 3600) : { data: null };
    return { ...product, prices: normalizeMerchPrices(product.prices), design_prices: normalizeMerchPrices(product.design_prices), variants: variants(product.variants), presentation_image_url: signed?.signedUrl || null };
  }));
  return { products };
}

export async function GET(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "clients.merch.view");
  if (denied) return denied;
  try {
    return NextResponse.json(await readConfig());
  } catch (error) {
    console.error("[merch-config] load failed", error);
    return NextResponse.json({ error: "Could not load Merch Commerce settings." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "clients.merch.edit");
  if (denied) return denied;
  try {
    const body = await request.json();
    const products = Array.isArray(body.products) ? body.products : [];
    if (!products.length) return NextResponse.json({ error: "At least one merch product is required." }, { status: 400 });
    const now = new Date().toISOString();
    const rows = products.map((product: Record<string, unknown>, index: number) => ({
      ...(validUuid(product.id) ? { id: product.id } : {}),
      code: text(product.code) || `merch-${Date.now()}-${index}`,
      name: text(product.name, "Merch product"),
      description: text(product.description) || null,
      unit_label: text(product.unit_label, "items"),
      prices: normalizeMerchPrices(product.prices),
      design_prices: normalizeMerchPrices(product.design_prices),
      variants: variants(product.variants),
      is_custom: product.is_custom === true,
      presentation_image_path: text(product.presentation_image_path) || null,
      presentation_image_name: text(product.presentation_image_name) || null,
      active: product.active !== false,
      sort_order: Number(product.sort_order) || index * 10,
      updated_at: now,
    }));
    const db = financeDb();
    const { error } = await db.from("merch_products").upsert(rows, { onConflict: "code" });
    if (error) throw error;
    await logActivity({ action: "merch.settings.update", page: "clients/merch", resource_type: "merch_catalogue", resource_label: `${rows.length} merch products`, metadata: { products: rows.length } });
    return NextResponse.json({ ok: true, ...(await readConfig()) });
  } catch (error) {
    console.error("[merch-config] save failed", error);
    return NextResponse.json({ error: "Could not save Merch Commerce settings." }, { status: 500 });
  }
}
