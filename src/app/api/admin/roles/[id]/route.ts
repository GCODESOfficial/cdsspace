import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { getSupabaseAdmin } from "@/lib/supabase";

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await guard(req);
    if (denied) return denied;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (typeof body.description === "string" || body.description === null) {
        patch.description = body.description ? body.description.toString().trim() : null;
    }
    if (Array.isArray(body.permissions)) patch.permissions = body.permissions.filter(Boolean);

    const sb = getSupabaseAdmin() as any;
    const { data, error } = await sb
        .from("admin_roles")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ role: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await guard(req);
    if (denied) return denied;
    const { id } = await params;
    const sb = getSupabaseAdmin() as any;
    const { error } = await sb.from("admin_roles").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
