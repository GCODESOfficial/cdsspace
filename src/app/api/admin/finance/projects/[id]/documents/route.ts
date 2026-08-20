import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";

/**
 * Project documents.
 *   GET  list all documents attached to the project (resolves cDoc / Protect Doc titles)
 *   POST { kind, title, cdoc_id? | protected_doc_id? | file_url? }
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req);
    if (denied) return denied;
    const { id } = await params;
    const sb = financeDb();
    const { data: rows, error } = await sb
        .from("project_documents")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const docs = (rows ?? []) as any[];
    const cdocIds = docs.filter((d) => d.kind === "cdoc" && d.cdoc_id).map((d) => d.cdoc_id);
    const protIds = docs.filter((d) => d.kind === "protected" && d.protected_doc_id).map((d) => d.protected_doc_id);

    const [cdocRes, protRes] = await Promise.all([
        cdocIds.length
            ? sb.from("team_cdocs").select("id, title, updated_at").in("id", cdocIds)
            : Promise.resolve({ data: [] as any[] }),
        protIds.length
            ? sb.from("team_protected_documents").select("id, title, file_url").in("id", protIds)
            : Promise.resolve({ data: [] as any[] }),
    ]);
    const cdocMap = new Map<string, any>((cdocRes.data ?? []).map((x: any) => [x.id, x]));
    const protMap = new Map<string, any>((protRes.data ?? []).map((x: any) => [x.id, x]));

    const documents = docs.map((d) => ({
        ...d,
        cdoc: d.cdoc_id ? cdocMap.get(d.cdoc_id) ?? null : null,
        protected_doc: d.protected_doc_id ? protMap.get(d.protected_doc_id) ?? null : null,
    }));
    return NextResponse.json({ documents });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req);
    if (denied) return denied;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const kind = body?.kind;
    const title = body?.title?.toString().trim();

    if (!kind || !["cdoc", "protected", "link"].includes(kind)) {
        return NextResponse.json({ error: "Invalid document kind." }, { status: 400 });
    }
    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

    const payload = {
        project_id: id,
        kind,
        title,
        cdoc_id: kind === "cdoc" ? body?.cdoc_id || null : null,
        protected_doc_id: kind === "protected" ? body?.protected_doc_id || null : null,
        file_url: kind === "link" ? body?.file_url?.toString().trim() || null : null,
        added_by: body?.added_by?.toString().trim() || null,
        visibility: body?.visibility === "client" ? "client" : "internal",
    };

    // Constraint mirror (friendlier error than raw Postgres check message).
    if (kind === "cdoc" && !payload.cdoc_id) return NextResponse.json({ error: "cdoc_id is required." }, { status: 400 });
    if (kind === "protected" && !payload.protected_doc_id) return NextResponse.json({ error: "protected_doc_id is required." }, { status: 400 });
    if (kind === "link" && !payload.file_url) return NextResponse.json({ error: "file_url is required." }, { status: 400 });

    const sb = financeDb();
    const { data, error } = await sb.from("project_documents").insert(payload).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ document: data });
}
