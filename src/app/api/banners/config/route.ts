import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizeClientBillingCurrency } from "@/lib/client-billing";
import { normalizeBannerPrices } from "@/lib/banner-commerce";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile, products, designServices, countries, deliveryZones, pickupLocations] = await Promise.all([
    supabaseAdmin.from("profiles").select("billing_currency").eq("id", session.user.id).maybeSingle(),
    supabaseAdmin.from("banner_products").select("*").eq("active", true).order("sort_order").order("name"),
    supabaseAdmin.from("banner_design_services").select("*").eq("active", true).order("created_at"),
    supabaseAdmin.from("banner_countries").select("*").eq("active", true).order("sort_order").order("country_name"),
    supabaseAdmin.from("banner_delivery_zones").select("*").eq("active", true).order("priority", { ascending: false }).order("name"),
    supabaseAdmin.from("banner_pickup_locations").select("*").eq("active", true).order("sort_order").order("name"),
  ]);
  const error = products.error || designServices.error || countries.error || deliveryZones.error || pickupLocations.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const productsWithPresentations = await Promise.all((products.data || []).map(async (product: Record<string, unknown>) => {
    const path = typeof product.presentation_image_path === "string" ? product.presentation_image_path : null;
    const { data: signed } = path
      ? await (supabaseAdmin as any).storage.from("sales-commerce").createSignedUrl(path, 60 * 60)
      : { data: null };
    return {
      ...product,
      presentation_image_url: signed?.signedUrl || null,
      standard_prices: normalizeBannerPrices(
        product.standard_prices || (String(product.quality).toLowerCase() !== "premium" ? product.prices : {}),
      ),
      premium_prices: normalizeBannerPrices(
        product.premium_prices || (String(product.quality).toLowerCase() === "premium" ? product.prices : {}),
      ),
    };
  }));

  return NextResponse.json({
    currency: normalizeClientBillingCurrency(profile.data?.billing_currency) || "USD",
    products: productsWithPresentations,
    designServices: designServices.data || [],
    countries: countries.data || [],
    deliveryZones: deliveryZones.data || [],
    pickupLocations: pickupLocations.data || [],
  });
}
