import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Admin roles - reusable permission bundles. Super admins, and sub-admins who
 * manage the Sub-Admins / Team Members section, can manage them.
 */
async function guard(req: NextRequest) {
    const s = await getAdminSessionAsync(req);
    if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (s.role === "super_admin") return null;
    if (
        hasPermission(s.permissions, "admin_roles.manage") ||
        hasPermission(s.permissions, "sub_admins") ||
        hasPermission(s.permissions, "team_members.promote") ||
        hasPermission(s.permissions, "team_members")
    ) {
        return null;
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET(req: NextRequest) {
    const denied = await guard(req);
    if (denied) return denied;
    const sb = getSupabaseAdmin() as any;
    const { data, error } = await sb
        .from("admin_roles")
        .select("*")
        .order("name", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ roles: data ?? [] });
}

export async function POST(req: NextRequest) {
    const denied = await guard(req);
    if (denied) return denied;
    const body = await req.json().catch(() => ({}));
    const name = body?.name?.toString().trim();
    const description = body?.description?.toString().trim() || null;
    const permissions: string[] = Array.isArray(body?.permissions) ? body.permissions.filter(Boolean) : [];
    if (!name) return NextResponse.json({ error: "Role name is required." }, { status: 400 });

    const sb = getSupabaseAdmin() as any;
    const { data, error } = await sb
        .from("admin_roles")
        .insert({ name, description, permissions })
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ role: data });
}
