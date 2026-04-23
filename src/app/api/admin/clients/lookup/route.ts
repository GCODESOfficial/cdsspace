import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Lightweight client-directory lookup used by the invoice form (and any
 * other form that wants to auto-fill client contact info).
 *
 *   GET  /api/admin/clients/lookup?q=&limit=
 *     → returns up to N matches from the `clients` admin table.
 *
 *   POST /api/admin/clients/lookup
 *     Body: { name, brand_name?, email?, phone?, address?, industry? }
 *     → creates a new row in `clients` and returns it. Used for the
 *       "Add new client" shortcut on the invoice form so admins never
 *       have to leave the flow to open the Client/Brand List.
 */

async function guard(req: NextRequest) {
    const session = await getAdminSessionAsync(req);
    if (!session) return { deny: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
    if (session.role === "super_admin") return { deny: null, session };
    const ok =
        hasPermission(session.permissions, "clients") ||
        hasPermission(session.permissions, "orders") ||
        hasPermission(session.permissions, "finance") ||
        hasPermission(session.permissions, "finance_invoices");
    if (!ok) return { deny: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null };
    return { deny: null, session };
}

export async function GET(req: NextRequest) {
    const { deny } = await guard(req);
    if (deny) return deny;

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || 8), 50);

    const sb = getSupabaseAdmin() as any;
    let query = sb
        .from("clients")
        .select("id, name, brand_name, email, phone, whatsapp, industry, contact_person, address, status")
        .order("name", { ascending: true })
        .limit(limit);

    if (q) {
        query = query.or(
            `name.ilike.%${q}%,brand_name.ilike.%${q}%,email.ilike.%${q}%,contact_person.ilike.%${q}%`,
        );
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const clients = (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        brand_name: c.brand_name ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        whatsapp: c.whatsapp ?? null,
        industry: c.industry ?? null,
        contact_person: c.contact_person ?? null,
        address: c.address ?? null,
        status: c.status ?? null,
    }));
    return NextResponse.json({ clients });
}

export async function POST(req: NextRequest) {
    const { deny } = await guard(req);
    if (deny) return deny;

    const body = await req.json().catch(() => ({}));
    const name = (body?.name ?? "").toString().trim();
    if (!name) return NextResponse.json({ error: "Client name is required." }, { status: 400 });

    const sb = getSupabaseAdmin() as any;

    // De-dupe on exact (case-insensitive) name so we don't pollute the
    // directory if the admin creates the same client twice.
    const { data: existing } = await sb
        .from("clients")
        .select("id, name, brand_name, email, phone, address, industry, contact_person, status")
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
    if (existing) {
        return NextResponse.json({ client: existing, existing: true });
    }

    const payload = {
        name,
        brand_name: body?.brand_name?.toString().trim() || null,
        email: body?.email?.toString().trim() || null,
        phone: body?.phone?.toString().trim() || null,
        whatsapp: body?.whatsapp?.toString().trim() || null,
        industry: body?.industry?.toString().trim() || null,
        contact_person: body?.contact_person?.toString().trim() || null,
        address: body?.address?.toString().trim() || null,
        status: "active",
    };

    const { data, error } = await sb.from("clients").insert(payload).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ client: data, existing: false });
}
