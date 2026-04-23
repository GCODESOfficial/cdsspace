/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/activity?page=team-members&limit=50
 *
 * Returns the recent activity feed for a given admin page. If no `page` is
 * supplied, returns the cross-page feed (used by the Activities overview).
 *
 * Only admins can read. Sub-admins see their permitted surface only if we
 * gate per-page later — for now it's any admin session.
 */
export async function GET(req: NextRequest) {
    const admin = await getAdminSession();
    if (!admin || !supabaseAdmin) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const page = url.searchParams.get("page");
    const limitRaw = parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = Math.min(200, Math.max(1, isNaN(limitRaw) ? 50 : limitRaw));
    const before = url.searchParams.get("before"); // optional cursor (ISO)

    const db = supabaseAdmin as any;
    let q = db
        .from("admin_activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
    if (page) q = q.eq("page", page);
    if (before) q = q.lt("created_at", before);

    const { data, error } = await q;
    if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, activities: data || [] });
}
