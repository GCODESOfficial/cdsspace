import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [countries, deliveryZones, pickupLocations, bankAccounts] = await Promise.all([
    supabaseAdmin.from("banner_countries").select("*").eq("active", true).order("sort_order").order("country_name"),
    supabaseAdmin.from("banner_delivery_zones").select("*").eq("active", true).order("priority", { ascending: false }).order("name"),
    supabaseAdmin.from("banner_pickup_locations").select("*").eq("active", true).order("sort_order").order("name"),
    supabaseAdmin.from("sales_bank_accounts").select("id, currency, country_code, bank_name, account_name, account_number, iban, swift_bic, routing_number, bank_address, instructions, logo_url, active, sort_order").eq("active", true).order("currency").order("sort_order"),
  ]);
  const error = countries.error || deliveryZones.error || pickupLocations.error || bankAccounts.error;
  if (error) {
    console.error("[sales-settings] client load failed", error);
    return NextResponse.json({ error: "Could not load delivery settings." }, { status: 500 });
  }

  return NextResponse.json({
    countries: countries.data || [],
    deliveryZones: deliveryZones.data || [],
    pickupLocations: pickupLocations.data || [],
    bankAccounts: bankAccounts.data || [],
  });
}
