import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { buildProductMetadata, formatDateTime } from "@/lib/product-metadata";
import CDocsClient from "./CDocsClient";

async function fetchDoc(token: string) {
    if (!supabaseAdmin) return null;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const db = supabaseAdmin as any;
    const { data } = await db
        .from("team_cdocs")
        .select("title, created_at, last_saved_at")
        .eq("share_token", token)
        .maybeSingle();
    return data ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
    const { token } = await params;
    const doc = await fetchDoc(token);
    const title = doc?.title?.trim() || "Untitled Document";
    const created = formatDateTime(doc?.created_at) || "recently";
    const lastEdit = formatDateTime(doc?.last_saved_at);
    const description = lastEdit
        ? `"${title}" · Created ${created} · Last edited ${lastEdit}. Read this document on cDocs by CDS Space.`
        : `"${title}" · Created ${created}. Read this document on cDocs by CDS Space.`;
    return buildProductMetadata({
        product: "cDocs",
        title,
        description,
        path: `/cdocs/${token}`,
    });
}

export default function Page() {
    return <CDocsClient />;
}
