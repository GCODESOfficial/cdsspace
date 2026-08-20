import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";
import { normalizeBannerPrices } from "@/lib/banner-commerce";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";

export const dynamic = "force-dynamic";

async function readConfig() {
  const db = financeDb();
  const [products, designServices] = await Promise.all([
    db.from("banner_products").select("*").order("sort_order").order("name"),
    db.from("banner_design_services").select("*").order("created_at"),
  ]);
  const error = products.error || designServices.error;
  if (error) throw error;
  const productsWithPresentations = await Promise.all((products.data || []).map(async (product: Record<string, unknown>) => {
    const path = typeof product.presentation_image_path === "string" ? product.presentation_image_path : null;
    const { data: signed } = path
      ? await db.storage.from("sales-commerce").createSignedUrl(path, 60 * 60)
      : { data: null };
    return {
      ...product,
      presentation_image_url: signed?.signedUrl || null,
      standard_prices: normalizeBannerPrices(product.standard_prices || (String(product.quality).toLowerCase() !== "premium" ? product.prices : {})),
      premium_prices: normalizeBannerPrices(product.premium_prices || (String(product.quality).toLowerCase() === "premium" ? product.prices : {})),
    };
  }));
  return {
    products: productsWithPresentations,
    designServices: designServices.data || [],
  };
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function validUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "clients.banners.view");
  if (denied) return denied;
  try {
    return NextResponse.json(await readConfig());
  } catch (error) {
    console.error("[banner-config] load failed", error);
    return NextResponse.json({ error: "Could not load banner settings." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "clients.banners.edit");
  if (denied) return denied;

  try {
    const body = await request.json();
    const products = Array.isArray(body.products) ? body.products : [];
    const designServices = Array.isArray(body.designServices) ? body.designServices : [];
    if (!products.length) return NextResponse.json({ error: "At least one banner size is required." }, { status: 400 });
    if (!designServices.length) return NextResponse.json({ error: "The new-design service configuration is required." }, { status: 400 });

    const now = new Date().toISOString();
    const db = financeDb();
    const productRows = products.map((product: Record<string, unknown>, index: number) => {
      const standardPrices = normalizeBannerPrices(product.standard_prices);
      const premiumPrices = normalizeBannerPrices(product.premium_prices);
      return {
        ...(validUuid(product.id) ? { id: product.id } : {}),
        code: cleanText(product.code) || `banner-${Date.now()}-${index}`,
        name: cleanText(product.name, "Banner"),
        description: cleanText(product.description) || null,
        width_cm: Math.max(1, Number(product.width_cm) || 1),
        height_cm: Math.max(1, Number(product.height_cm) || 1),
        quality: "Standard",
        environment: cleanText(product.environment, "Indoor"),
        standard_prices: standardPrices,
        premium_prices: premiumPrices,
        prices: standardPrices,
        presentation_image_path: cleanText(product.presentation_image_path) || null,
        presentation_image_name: cleanText(product.presentation_image_name) || null,
        active: product.active !== false,
        sort_order: Number(product.sort_order) || index * 10,
        updated_at: now,
      };
    });
    const serviceRows = designServices.map((service: Record<string, unknown>) => ({
      ...(validUuid(service.id) ? { id: service.id } : {}),
      code: cleanText(service.code, "banner-new-design"),
      name: cleanText(service.name, "Create a new banner design"),
      description: cleanText(service.description) || null,
      prices: normalizeBannerPrices(service.prices),
      active: service.active !== false,
      updated_at: now,
    }));

    const writes = await Promise.all([
      db.from("banner_products").upsert(productRows, { onConflict: "code" }),
      db.from("banner_design_services").upsert(serviceRows, { onConflict: "code" }),
    ]);
    const writeError = writes.find((result) => result.error)?.error;
    if (writeError) throw writeError;

    const storedProducts = await db.from("banner_products").select("code");
    if (storedProducts.error) throw storedProducts.error;
    const keepCodes = new Set(productRows.map((product: { code: string }) => product.code));
    const removedCodes = (storedProducts.data || []).map((product: { code: string }) => product.code).filter((code: string) => !keepCodes.has(code));
    if (removedCodes.length) {
      const deactivated = await db.from("banner_products").update({ active: false, updated_at: now }).in("code", removedCodes);
      if (deactivated.error) throw deactivated.error;
    }

    await logActivity({
      action: "banner.settings.update",
      page: "clients/banners",
      resource_type: "banner_production_config",
      resource_label: `${productRows.length} sizes · ${serviceRows.length} design services`,
      metadata: { products: productRows.length, design_services: serviceRows.length },
    });
    return NextResponse.json({ ok: true, ...(await readConfig()) });
  } catch (error) {
    console.error("[banner-config] save failed", error);
    return NextResponse.json({ error: "Could not save banner settings." }, { status: 500 });
  }
}
