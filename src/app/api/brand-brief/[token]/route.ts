import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Public endpoint - no auth required. The token itself is the credential.
 *
 *  GET   → returns the brief (if the link is still valid)
 *  PATCH → saves partial answers (draft auto-save)
 *  POST  → finalises & marks the brief as submitted
 */

const ALLOWED_FIELDS = [
    "brand_name",
    "brand_tagline",
    "industry",
    "brand_description",
    "contact_name",
    "contact_email",
    "contact_phone",
    "target_audience",
    "competitors",
    "unique_selling_point",
    "brand_personality",
    "brand_values",
    "design_preferences",
    "inspiration_references",
    "assets_needed",
    "goals",
    "long_term_vision",
    "budget_range",
    "budget_currency",
    "timeline",
    "additional_notes",
] as const;

type AllowedField = (typeof ALLOWED_FIELDS)[number];

function pickAllowed(body: Record<string, unknown>) {
    const patch: Record<string, unknown> = {};
    for (const k of ALLOWED_FIELDS) {
        if (k in body) {
            if (k === "assets_needed") {
                patch[k] = Array.isArray(body[k]) ? body[k] : [];
            } else {
                patch[k] = typeof body[k] === "string" ? body[k] : body[k] ?? null;
            }
        }
    }
    return patch;
}

async function loadBrief(token: string) {
    const sb = getSupabaseAdmin() as any;
    const { data } = await sb
        .from("brand_briefs")
        .select("*")
        .eq("public_token", token)
        .maybeSingle();
    return data;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
    const brief = await loadBrief(token);
    if (!brief) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    if (brief.status === "archived") {
        return NextResponse.json({ error: "This brief link has been archived." }, { status: 410 });
    }
    if (brief.expires_at && new Date(brief.expires_at) < new Date()) {
        return NextResponse.json({ error: "This brief link has expired." }, { status: 410 });
    }
    return NextResponse.json({ brief });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const existing = await loadBrief(token);
    if (!existing) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    if (existing.status === "submitted") {
        return NextResponse.json({ error: "This brief has already been submitted and can't be edited." }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const patch = pickAllowed(body);

    const sb = getSupabaseAdmin() as any;
    const { data, error } = await sb
        .from("brand_briefs")
        .update(patch)
        .eq("public_token", token)
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ brief: data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const existing = await loadBrief(token);
    if (!existing) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    if (existing.status === "submitted") {
        return NextResponse.json({ error: "This brief has already been submitted." }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const patch = pickAllowed(body);

    if (!patch.brand_name?.toString().trim()) {
        return NextResponse.json({ error: "Brand name is required." }, { status: 400 });
    }
    if (!patch.contact_email?.toString().trim()) {
        return NextResponse.json({ error: "Contact email is required." }, { status: 400 });
    }

    const sb = getSupabaseAdmin() as any;
    const { data, error } = await sb
        .from("brand_briefs")
        .update({
            ...patch,
            status: "submitted",
            submitted_at: new Date().toISOString(),
        })
        .eq("public_token", token)
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ brief: data });
}
