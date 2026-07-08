/**
 * Server-side data layer for pricelists (GlashDB table `pricing_lists`).
 *
 * Table shape (see glashdb-pricing-lists.sql - run manually in GlashDB):
 *   id          text primary key
 *   slug        text unique not null
 *   title       text not null
 *   published   boolean not null default false
 *   data        jsonb not null      -- the full PricingListData
 *   created_at  timestamptz default now()
 *   updated_at  timestamptz default now()
 *
 * Like the legal pages, reads fall back to the in-repo seed when the table
 * is empty or the migration hasn't been applied yet, so the client-facing
 * /pricing pages never hard-fail.
 */
import "server-only";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { BRAND_IDENTITY_SEED, BRAND_IDENTITY_SLUG } from "./seed";
import { slugify, type PricingListData } from "./types";

const TABLE = "pricing_lists";

/** Rehydrate a DB row into a PricingListData (row wins for id/slug/published). */
function rowToData(row: Record<string, unknown>): PricingListData {
    const data = (row.data ?? {}) as PricingListData;
    return {
        ...data,
        id: String(row.id ?? data.id),
        slug: String(row.slug ?? data.slug),
        title: String(row.title ?? data.title),
        published: Boolean(row.published),
        createdAt: row.created_at ? String(row.created_at) : data.createdAt,
        updatedAt: row.updated_at ? String(row.updated_at) : data.updatedAt,
    };
}

/** List pricelists. On any DB error / empty table, returns the seed list. */
export async function listPricingLists(
    opts: { publishedOnly?: boolean } = {},
): Promise<PricingListData[]> {
    try {
        const sb = getGlashDbAdmin();
        let q = sb.from(TABLE).select("*").order("created_at", { ascending: false });
        if (opts.publishedOnly) q = q.eq("published", true);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) {
            return opts.publishedOnly
                ? BRAND_IDENTITY_SEED.published
                    ? [BRAND_IDENTITY_SEED]
                    : []
                : [BRAND_IDENTITY_SEED];
        }
        return (data as Record<string, unknown>[]).map(rowToData);
    } catch {
        // Table missing / migration not applied → serve the seed so the
        // public pages keep working.
        return opts.publishedOnly && !BRAND_IDENTITY_SEED.published ? [] : [BRAND_IDENTITY_SEED];
    }
}

export async function getPricingListBySlug(slug: string): Promise<PricingListData | null> {
    try {
        const sb = getGlashDbAdmin();
        const { data, error } = await sb.from(TABLE).select("*").eq("slug", slug).maybeSingle();
        if (error) throw error;
        if (data) return rowToData(data as Record<string, unknown>);
        // Not found in DB - allow the built-in seed slug to still resolve.
        return slug === BRAND_IDENTITY_SLUG ? BRAND_IDENTITY_SEED : null;
    } catch {
        return slug === BRAND_IDENTITY_SLUG ? BRAND_IDENTITY_SEED : null;
    }
}

export async function getPricingListById(id: string): Promise<PricingListData | null> {
    try {
        const sb = getGlashDbAdmin();
        const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        if (data) return rowToData(data as Record<string, unknown>);
        return id === BRAND_IDENTITY_SEED.id ? BRAND_IDENTITY_SEED : null;
    } catch {
        return id === BRAND_IDENTITY_SEED.id ? BRAND_IDENTITY_SEED : null;
    }
}

/** Ensure a slug is unique, appending -2, -3 … if needed (ignoring `exceptId`). */
async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
    const root = slugify(base);
    try {
        const sb = getGlashDbAdmin();
        const { data } = await sb.from(TABLE).select("id,slug").ilike("slug", `${root}%`);
        const taken = new Set(
            ((data as { id: string; slug: string }[] | null) ?? [])
                .filter((r) => r.id !== exceptId)
                .map((r) => r.slug),
        );
        if (!taken.has(root)) return root;
        for (let i = 2; i < 999; i++) {
            const candidate = `${root}-${i}`;
            if (!taken.has(candidate)) return candidate;
        }
        return `${root}-${Date.now()}`;
    } catch {
        return root;
    }
}

/**
 * Create or update a pricelist. If `data.id` is absent a new row is inserted
 * with a generated id and a unique slug. Throws on DB failure (callers in the
 * admin API surface the message).
 */
export async function savePricingList(input: PricingListData): Promise<PricingListData> {
    const sb = getGlashDbAdmin();
    const isNew = !input.id || input.id === BRAND_IDENTITY_SEED.id;
    const id = isNew ? crypto.randomUUID() : input.id;
    const slug = await uniqueSlug(input.slug || input.title, isNew ? undefined : id);
    const now = new Date().toISOString();

    const payload: PricingListData = {
        ...input,
        id,
        slug,
        updatedAt: now,
        createdAt: isNew ? now : input.createdAt ?? now,
    };

    const row = {
        id,
        slug,
        title: payload.title,
        published: payload.published,
        data: payload,
        updated_at: now,
        ...(isNew ? { created_at: now } : {}),
    };

    const { error } = await sb.from(TABLE).upsert(row, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return payload;
}

export async function deletePricingList(id: string): Promise<void> {
    const sb = getGlashDbAdmin();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
}
