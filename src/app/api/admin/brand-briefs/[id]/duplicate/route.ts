import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAdmin } from "@/lib/finance/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { randomToken } from "@/lib/finance/types";

/**
 * Duplicate a brand brief as a FRESH, pending request. Only the admin-facing
 * label / note carry over - the client-facing answers are cleared so the
 * duplicated link asks for a fresh submission rather than exposing the
 * original client's answers under a new URL.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = requireFinanceAdmin(req);
    if (denied) return denied;

    const { id } = await params;
    const sb = getSupabaseAdmin() as any;

    const { data: src, error: fetchErr } = await sb
        .from("brand_briefs")
        .select("invite_label, invite_note")
        .eq("id", id)
        .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!src) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    const baseLabel = (src.invite_label ?? "").trim();
    const duplicatedLabel = baseLabel ? `${baseLabel} (copy)` : null;

    const { data, error } = await sb
        .from("brand_briefs")
        .insert({
            public_token: randomToken(28),
            invite_label: duplicatedLabel,
            invite_note: src.invite_note ?? null,
            status: "pending",
        })
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ brief: data });
}
