import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAdmin } from "@/lib/finance/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { randomToken } from "@/lib/finance/types";

/** List all brand briefs (admin). */
export async function GET(req: NextRequest) {
    const denied = requireFinanceAdmin(req);
    if (denied) return denied;
    const sb = getSupabaseAdmin() as any;
    const { data, error } = await sb
        .from("brand_briefs")
        .select("*")
        .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ briefs: data ?? [] });
}

/**
 * Create a new brief invite. Admin enters an optional label + note; we
 * generate a public token and return the full row so the caller can open
 * the share modal immediately.
 */
export async function POST(req: NextRequest) {
    const denied = requireFinanceAdmin(req);
    if (denied) return denied;

    const body = await req.json().catch(() => ({}));
    const invite_label: string | null = body?.invite_label?.toString().trim() || null;
    const invite_note: string | null = body?.invite_note?.toString().trim() || null;

    const public_token = randomToken(28);

    const sb = getSupabaseAdmin() as any;
    const { data, error } = await sb
        .from("brand_briefs")
        .insert({
            public_token,
            invite_label,
            invite_note,
            status: "pending",
        })
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ brief: data });
}
