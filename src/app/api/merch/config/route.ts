import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizeClientBillingCurrency } from "@/lib/client-billing";
import { normalizeMerchPrices } from "@/lib/merch-commerce";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [profile, products, countries, deliveryZones, pickupLocations] = await Promise.all([
    supabaseAdmin.from("profiles").select("billing_currency").eq("id", session.user.id).maybeSingle(),
    supabaseAdmin.from("merch_products").select("*").eq("active", true).order("sort_order").order("name"),
    supabaseAdmin.from("banner_countries").select("*").eq("active", true).order("sort_order").order("country_name"),
    supabaseAdmin.from("banner_delivery_zones").select("*").eq("active", true).order("priority", { ascending: false }).order("name"),
    supabaseAdmin.from("banner_pickup_locations").select("*").eq("active", true).order("sort_order").order("name"),
  ]);
  const error = products.error || countries.error || deliveryZones.error || pickupLocations.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const productRows = await Promise.all((products.data || []).map(async (product: Record<string, any>) => {
    const { data: signed } = product.presentation_image_path
      ? await (supabaseAdmin as any).storage.from("sales-commerce").createSignedUrl(product.presentation_image_path, 60 * 60)
      : { data: null };
    return { ...product, prices: normalizeMerchPrices(product.prices), design_prices: normalizeMerchPrices(product.design_prices), presentation_image_url: signed?.signedUrl || null };
  }));
  return NextResponse.json({
    currency: normalizeClientBillingCurrency(profile.data?.billing_currency) || "USD",
    products: productRows,
    countries: countries.data || [],
    deliveryZones: deliveryZones.data || [],
    pickupLocations: pickupLocations.data || [],
  });
}
