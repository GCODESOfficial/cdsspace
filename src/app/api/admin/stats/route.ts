import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Run all count queries in parallel
    const [
      profilesResult,
      designResult,
      bannerResult,
      activeSubsResult,
      pendingDesignResult,
      pendingBannerResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .neq("email_verified_at", null)
        .eq("account_status", "active"),
      supabaseAdmin
        .from("design_requests")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("banner_requests")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabaseAdmin
        .from("design_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "PENDING"),
      supabaseAdmin
        .from("banner_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "PENDING"),
    ]);

    // Check for errors
    const errors = [
      profilesResult.error,
      designResult.error,
      bannerResult.error,
      activeSubsResult.error,
      pendingDesignResult.error,
      pendingBannerResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw errors[0];
    }

    const orderTables = ["design_requests", "banner_requests", "merch_orders", "recurring_designs"] as const;
    const [allCounts, pendingCounts, activeCounts, completedCounts] = await Promise.all([
      Promise.all(orderTables.map((table) => supabaseAdmin.from(table).select("id", { count: "exact", head: true }))),
      Promise.all(orderTables.map((table) => supabaseAdmin.from(table).select("id", { count: "exact", head: true }).in("status", ["PENDING", "IN_REVIEW", "AWAITING_QUOTE", "AWAITING_PAYMENT"]))),
      Promise.all(orderTables.map((table) => supabaseAdmin.from(table).select("id", { count: "exact", head: true }).in("status", ["ACTIVE", "SCHEDULED"]))),
      Promise.all(orderTables.map((table) => supabaseAdmin.from(table).select("id", { count: "exact", head: true }).eq("status", "COMPLETED"))),
    ]);
    const sumCounts = (results: Array<{ count?: number | null }>) => results.reduce((sum, result) => sum + (result.count || 0), 0);

    return NextResponse.json({
      total_clients: profilesResult.count ?? 0,
      total_design_requests: designResult.count ?? 0,
      total_banner_requests: bannerResult.count ?? 0,
      total_active_subscriptions: activeSubsResult.count ?? 0,
      pending_orders:
        (pendingDesignResult.count ?? 0) + (pendingBannerResult.count ?? 0),
      total: sumCounts(allCounts),
      pending: sumCounts(pendingCounts),
      inProgress: sumCounts(activeCounts),
      completed: sumCounts(completedCounts),
    });
  } catch (error) {
    console.error("Admin stats GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
