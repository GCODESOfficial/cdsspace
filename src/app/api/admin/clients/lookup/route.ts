import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findClientDuplicates } from "@/lib/client-directory-server";

/**
 * Lightweight client-directory lookup used by the invoice form (and any
 * other form that wants to auto-fill client contact info).
 *
 *   GET  /api/admin/clients/lookup?q=&limit=
 *     → returns up to N matches from the `clients` admin table.
 *
 *   POST /api/admin/clients/lookup
 *     Body: { name, brand_name?, email?, phone?, address?, industries? }
 *     → creates a new row in `clients` and returns it. Used for the
 *       "Add new client" shortcut on the invoice form so admins never
 *       have to leave the flow to open the Client/Brand List.
 */

async function guard(req: NextRequest) {
    const session = await getAdminSessionAsync(req);
    if (!session) return { deny: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
    if (session.role === "super_admin") return { deny: null, session };
    const ok =
        hasPermission(session.permissions, "clients.view") ||
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
        .select("id, name, brand_name, email, phone, whatsapp, industry, industries, contact_person, address, status")
        .order("name", { ascending: true })
        .limit(limit);

    if (q) {
        query = query.or(
            `name.ilike.%${q}%,brand_name.ilike.%${q}%,email.ilike.%${q}%,contact_person.ilike.%${q}%`,
        );
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const emails = Array.from(new Set((data ?? [])
        .map((client: any) => String(client.email || "").trim())
        .filter(Boolean)));
    const { data: profiles } = emails.length
        ? await sb.from("profiles").select("email, billing_currency")
            .in("email", emails)
            .neq("email_verified_at", null)
            .eq("account_status", "active")
        : { data: [] };
    const currencyByEmail = new Map(
        (profiles ?? []).map((profile: any) => [String(profile.email || "").toLowerCase(), profile.billing_currency || null]),
    );

    const clients = (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        brand_name: c.brand_name ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        whatsapp: c.whatsapp ?? null,
        industry: c.industry ?? null,
        industries: c.industries ?? (c.industry ? [c.industry] : []),
        contact_person: c.contact_person ?? null,
        address: c.address ?? null,
        status: c.status ?? null,
        billing_currency: currencyByEmail.get(String(c.email || "").toLowerCase()) || null,
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

    const rawIndustries = Array.isArray(body?.industries) ? body.industries : [body?.industry];
    const industryMap = new Map<string, string>();
    for (const value of rawIndustries) {
        const industry = typeof value === "string" ? value.trim().slice(0, 140) : "";
        if (industry && !industryMap.has(industry.toLowerCase())) industryMap.set(industry.toLowerCase(), industry);
    }
    const industries = [...industryMap.values()].slice(0, 12);

    const payload = {
        name,
        brand_name: body?.brand_name?.toString().trim() || null,
        email: body?.email?.toString().trim() || null,
        phone: body?.phone?.toString().trim() || null,
        whatsapp: body?.whatsapp?.toString().trim() || null,
        industry: industries[0] || null,
        industries,
        contact_person: body?.contact_person?.toString().trim() || null,
        address: body?.address?.toString().trim() || null,
        status: "active",
    };

    const duplicates = await findClientDuplicates(payload);
    if (duplicates.manual.length || duplicates.profiles.length) {
        return NextResponse.json({
            error: "A matching client already exists. Choose the existing record or merge it with the platform account.",
            duplicates,
        }, { status: 409 });
    }

    const { data, error } = await sb.from("clients").insert(payload).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ client: data, existing: false });
}
