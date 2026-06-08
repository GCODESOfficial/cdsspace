/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAdminSession } from "@/lib/admin-session";
import { getPermissionForRoute, hasPermission, PERMISSION_GROUPS } from "@/lib/admin-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/activity?page=team-members&limit=50
 *
 * Returns the recent activity feed for a given admin page. If no `page` is
 * supplied, returns the cross-page feed (used by the Activities overview).
 *
 * Only admins can read. Sub-admins see activities only for sections they can
 * access, so a finance-invoices sub-admin can see the same shared invoice
 * audit trail as the super-admin without seeing unrelated admin activity.
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

    if (admin.role !== "super_admin" && page) {
        const routePath = page.startsWith("/admin") ? page : `/admin/${page}`;
        const permissionKey = getPermissionForRoute(routePath);
        if (permissionKey && !hasPermission(admin.permissions, permissionKey)) {
            return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
        }
    }

    const db = supabaseAdmin as any;
    let q = db
        .from("admin_activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
    if (page) q = q.eq("page", page);
    if (!page && admin.role !== "super_admin") {
        const permittedPages = PERMISSION_GROUPS
            .filter((group) => group.route && hasPermission(admin.permissions, group.key))
            .map((group) => group.route!.replace(/^\/admin\/?/, "") || "dashboard");
        if (permittedPages.length === 0) {
            return NextResponse.json({ ok: true, activities: [] });
        }
        q = q.in("page", permittedPages);
    }
    if (before) q = q.lt("created_at", before);

    const { data, error } = await q;
    if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, activities: data || [] });
}
