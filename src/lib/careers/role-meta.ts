import { getSupabaseAdmin } from "@/lib/supabase";

export const ROLE_TYPE_LABELS: Record<string, string> = {
    "full-time": "Full-time",
    "part-time": "Part-time",
    "contract": "Contract",
    "intern": "Internship",
    "freelance": "Freelance",
};

export function roleTypeLabel(type: string): string {
    return ROLE_TYPE_LABELS[type] || type;
}

export interface RoleMeta {
    id: string;
    title: string;
    role_type: string;
    location: string | null;
    description: string | null;
}

/**
 * Server-side lookup for a single open role, used to build share metadata and
 * the OpenGraph card for `/Career/role/[id]`. Mirrors the resilient pattern in
 * the invoice share route: returns null on any failure so the route can fall
 * back to the generic careers metadata.
 */
export async function fetchRoleMeta(id: string): Promise<RoleMeta | null> {
    try {
        const sb = getSupabaseAdmin();
        const { data } = await sb
            .from("open_roles")
            .select("id, title, role_type, location, description, is_active")
            .eq("id", id)
            .maybeSingle();
        if (!data || data.is_active === false) return null;
        return {
            id: data.id,
            title: data.title,
            role_type: data.role_type,
            location: data.location ?? null,
            description: data.description ?? null,
        };
    } catch {
        return null;
    }
}
