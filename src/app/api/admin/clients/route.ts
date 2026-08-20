import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { sanitizeOrFilterTerm } from "@/lib/search-filter";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    // Fetch all profiles
    let profilesQuery = supabaseAdmin
      .from("profiles")
      .select("*")
      .neq("email_verified_at", null)
      .eq("account_status", "active");

    const safeSearch = sanitizeOrFilterTerm(search);
    if (safeSearch) {
      profilesQuery = profilesQuery.or(
        `full_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`
      );
    }

    const { data: profiles, error: profilesError } = await profilesQuery.order("created_at", { ascending: false });

    if (profilesError) {
      throw profilesError;
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ clients: [] });
    }

    // Get all profile IDs for batch queries
    const profileIds = profiles.map((p: { id: string }) => p.id);

    // Fetch subscription counts per user
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .in("user_id", profileIds);

    if (subError) {
      throw subError;
    }

    // Fetch design request counts per user
    const { data: designRequests, error: designError } = await supabaseAdmin
      .from("design_requests")
      .select("user_id")
      .in("user_id", profileIds);

    if (designError) {
      throw designError;
    }

    // Fetch banner request counts per user
    const { data: bannerRequests, error: bannerError } = await supabaseAdmin
      .from("banner_requests")
      .select("user_id")
      .in("user_id", profileIds);

    if (bannerError) {
      throw bannerError;
    }

    // Build count maps
    const subCounts = new Map<string, number>();
    for (const s of subscriptions ?? []) {
      subCounts.set(s.user_id, (subCounts.get(s.user_id) ?? 0) + 1);
    }

    const designCounts = new Map<string, number>();
    for (const d of designRequests ?? []) {
      designCounts.set(d.user_id, (designCounts.get(d.user_id) ?? 0) + 1);
    }

    const bannerCounts = new Map<string, number>();
    for (const b of bannerRequests ?? []) {
      bannerCounts.set(b.user_id, (bannerCounts.get(b.user_id) ?? 0) + 1);
    }

    // Merge counts into profiles
    const clients = profiles.map((profile: { id: string; [key: string]: unknown }) => ({
      ...profile,
      subscription_count: subCounts.get(profile.id) ?? 0,
      design_request_count: designCounts.get(profile.id) ?? 0,
      banner_request_count: bannerCounts.get(profile.id) ?? 0,
    }));

    return NextResponse.json({ clients });
  } catch (error) {
    console.error("Admin clients GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
