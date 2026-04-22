import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { buildProductMetadata } from "@/lib/product-metadata";
import CSignClient from "./CSignClient";

async function fetchSignRequest(token: string) {
    if (!supabaseAdmin) return null;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const db = supabaseAdmin as any;
    const { data: reqRow } = await db
        .from("team_signature_requests")
        .select("document_id, requested_by, requested_by_admin")
        .eq("access_token", token)
        .maybeSingle();
    if (!reqRow) return null;

    let docTitle: string | null = null;
    if (reqRow.document_id) {
        const { data: d } = await db
            .from("team_cdocs")
            .select("title")
            .eq("id", reqRow.document_id)
            .maybeSingle();
        docTitle = d?.title ?? null;
    }

    let requester = reqRow.requested_by_admin ? "CDS Space Admin" : null;
    if (!requester && reqRow.requested_by) {
        const { data: u } = await db
            .from("team_members")
            .select("full_name")
            .eq("id", reqRow.requested_by)
            .maybeSingle();
        requester = u?.full_name ?? null;
    }
    return { docTitle, requester };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
    const { token } = await params;
    const info = await fetchSignRequest(token);
    const title = info?.docTitle?.trim() || "Signature Request";
    const requester = info?.requester?.trim();
    const description = requester
        ? `${requester} is requesting your signature on "${title}". Review & sign securely on cSign by CDS Space.`
        : `You have a signature request on "${title}". Review & sign securely on cSign by CDS Space.`;
    return buildProductMetadata({
        product: "cSign",
        title: requester ? `${title} — from ${requester}` : title,
        description,
        path: `/csign/${token}`,
    });
}

export default function Page() {
    return <CSignClient />;
}
