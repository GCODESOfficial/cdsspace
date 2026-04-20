import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    // Fetch design requests with profiles
    let designQuery = supabaseAdmin
      .from("design_requests")
      .select("*, profiles!user_id(id, email, full_name, company_name, avatar_url)");

    if (status) {
      designQuery = designQuery.eq("status", status);
    }
    if (search) {
      designQuery = designQuery.or(
        `title.ilike.%${search}%,profiles.full_name.ilike.%${search}%`
      );
    }

    const { data: designRequests, error: designError } = await designQuery.order("created_at", { ascending: false });

    if (designError) {
      throw designError;
    }

    // Fetch banner requests with profiles
    let bannerQuery = supabaseAdmin
      .from("banner_requests")
      .select("*, profiles!user_id(id, email, full_name, company_name, avatar_url)");

    if (status) {
      bannerQuery = bannerQuery.eq("status", status);
    }
    if (search) {
      bannerQuery = bannerQuery.or(
        `title.ilike.%${search}%,profiles.full_name.ilike.%${search}%`
      );
    }

    const { data: bannerRequests, error: bannerError } = await bannerQuery.order("created_at", { ascending: false });

    if (bannerError) {
      throw bannerError;
    }

    // Fetch merch orders (if table exists)
    let merchOrders: any[] = [];
    try {
      let merchQuery = supabaseAdmin
        .from("merch_orders")
        .select("*, profiles!user_id(id, email, full_name, company_name, avatar_url)");
      if (status) merchQuery = merchQuery.eq("status", status);
      const { data } = await merchQuery.order("created_at", { ascending: false });
      if (data) merchOrders = data;
    } catch {}

    // Fetch recurring design subscriptions (if table exists)
    let recurringOrders: any[] = [];
    try {
      let recurringQuery = supabaseAdmin
        .from("recurring_designs")
        .select("*, profiles!user_id(id, email, full_name, company_name, avatar_url)");
      if (status) recurringQuery = recurringQuery.eq("status", status);
      const { data } = await recurringQuery.order("created_at", { ascending: false });
      if (data) recurringOrders = data;
    } catch {}

    // Combine all orders into a single sorted list
    const allOrders = [
      ...(designRequests ?? []).map((d: any) => ({
        id: d.id, displayId: `DS-${String(d.id).slice(0, 6).toUpperCase()}`,
        type: "design", title: d.title, status: d.status, created_at: d.created_at,
        profile: d.profiles ? { full_name: d.profiles.full_name, email: d.profiles.email } : null,
      })),
      ...(bannerRequests ?? []).map((b: any) => ({
        id: b.id, displayId: `BN-${String(b.id).slice(0, 6).toUpperCase()}`,
        type: "banner", title: b.title, status: b.status, created_at: b.created_at,
        profile: b.profiles ? { full_name: b.profiles.full_name, email: b.profiles.email } : null,
      })),
      ...merchOrders.map((m: any) => ({
        id: m.id, displayId: `MR-${String(m.id).slice(0, 6).toUpperCase()}`,
        type: "merch", title: m.title, status: m.status, created_at: m.created_at,
        profile: m.profiles ? { full_name: m.profiles.full_name, email: m.profiles.email } : null,
      })),
      ...recurringOrders.map((r: any) => ({
        id: r.id, displayId: `RC-${String(r.id).slice(0, 6).toUpperCase()}`,
        type: "recurring", title: r.title, status: r.status, created_at: r.created_at,
        profile: r.profiles ? { full_name: r.profiles.full_name, email: r.profiles.email } : null,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Apply search filter
    const filteredOrders = search
      ? allOrders.filter(o => o.title?.toLowerCase().includes(search.toLowerCase()) || o.profile?.full_name?.toLowerCase().includes(search.toLowerCase()))
      : allOrders;

    return NextResponse.json({
      orders: filteredOrders,
      design_requests: designRequests ?? [],
      banner_requests: bannerRequests ?? [],
    });
  } catch (error) {
    console.error("Admin orders GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
