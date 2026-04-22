/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const BUCKET = "ai-training-docs";

function canManageAi(permissions: string[]) {
  return hasPermission(permissions, "workspace.ai_system") || hasPermission(permissions, "all");
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManageAi(session.permissions)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured" }, { status: 500 });
  }

  const { id } = await params;
  const db = supabaseAdmin as any;
  const { data: existing, error: findError } = await db
    .from("ai_knowledge_documents")
    .select("id, file_path")
    .eq("id", id)
    .maybeSingle();

  if (findError) return NextResponse.json({ ok: false, error: findError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });

  if (existing.file_path) {
    await db.storage.from(BUCKET).remove([existing.file_path]);
  }

  const { error } = await db.from("ai_knowledge_documents").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
