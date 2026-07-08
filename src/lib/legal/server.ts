import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_LEGAL_DOCS, type LegalSlug } from "./default-content";

export interface LegalDocumentRow {
    id: string;
    slug: LegalSlug;
    title: string;
    subtitle: string | null;
    content: string;
    effective_date: string;
    version: number;
    updated_at: string;
    updated_by: string | null;
}

/**
 * Load a legal document from GlashDB. Falls back to the seed content in
 * `default-content.ts` if the row doesn't exist yet. This keeps /privacy
 * and /terms rendering before the admin has initialised the table.
 */
export async function loadLegalDocument(slug: LegalSlug): Promise<LegalDocumentRow> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = getSupabaseAdmin();
    const { data, error } = await sb
        .from("legal_documents")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

    if (error) {
        console.error(`[legal] failed to load ${slug}:`, error.message);
    }

    if (data) return data as LegalDocumentRow;

    // Fall back to seed content.
    const seed = DEFAULT_LEGAL_DOCS[slug];
    return {
        id: `seed-${slug}`,
        slug,
        title: seed.title,
        subtitle: seed.subtitle,
        content: seed.content,
        effective_date: seed.effective_date,
        version: 0,
        updated_at: new Date().toISOString(),
        updated_by: null,
    };
}

/**
 * Insert or update the legal document row. Bumps `version` by 1 each call.
 * `updatedBy` is the admin email pulled from the session.
 */
export async function upsertLegalDocument(params: {
    slug: LegalSlug;
    title: string;
    subtitle: string | null;
    content: string;
    effectiveDate: string;
    updatedBy: string | null;
}): Promise<LegalDocumentRow> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = getSupabaseAdmin();

    const { data: existing } = await sb
        .from("legal_documents")
        .select("version")
        .eq("slug", params.slug)
        .maybeSingle();

    const nextVersion = (existing?.version ?? 0) + 1;

    const { data, error } = await sb
        .from("legal_documents")
        .upsert(
            {
                slug: params.slug,
                title: params.title,
                subtitle: params.subtitle,
                content: params.content,
                effective_date: params.effectiveDate,
                version: nextVersion,
                updated_at: new Date().toISOString(),
                updated_by: params.updatedBy,
            },
            { onConflict: "slug" }
        )
        .select("*")
        .single();

    if (error) throw new Error(error.message);
    return data as LegalDocumentRow;
}
