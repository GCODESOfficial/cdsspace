import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAdmin } from "@/lib/finance/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Create a finance_projects row from a brand brief. We pre-fill whatever
 * details the brief captured (name, client, currency default, notes that
 * carry the brief's core context) so the admin can pick up from there.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = requireFinanceAdmin(req);
    if (denied) return denied;

    const { id } = await params;
    const sb = getSupabaseAdmin() as any;

    const { data: brief, error: fetchErr } = await sb
        .from("brand_briefs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    const name = brief.brand_name?.trim() || brief.invite_label?.trim() || "New project";
    const client = brief.contact_name?.trim() || brief.brand_name?.trim() || "Client";

    // NOTE: budget is deliberately NOT written into project notes — notes are
    // visible to all assigned team members, and budget is management-only. It
    // stays on the linked brand brief, where /api/team/work gates it by role.
    const notes = [
        brief.brand_description && `About: ${brief.brand_description}`,
        brief.target_audience && `Audience: ${brief.target_audience}`,
        Array.isArray(brief.assets_needed) && brief.assets_needed.length
            ? `Scope: ${brief.assets_needed.join(", ")}`
            : null,
        brief.timeline && `Timeline: ${brief.timeline}`,
        brief.contact_email && `Client email: ${brief.contact_email}`,
        brief.contact_phone && `Client phone: ${brief.contact_phone}`,
    ]
        .filter(Boolean)
        .join("\n\n");

    const { data: project, error: insertErr } = await sb
        .from("finance_projects")
        .insert({
            name,
            client,
            currency: "NGN",
            status: "active",
            notes: notes || null,
        })
        .select()
        .single();
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    // Persist the brief -> project link so the brief surfaces inside the
    // project's workspace Files panel. Best-effort: if the project_id column
    // hasn't been migrated yet (glashdb-brief-project-link.sql), don't fail the
    // project creation over it.
    await sb.from("brand_briefs").update({ project_id: project.id }).eq("id", id);

    return NextResponse.json({ project });
}
