/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const BUCKET = "ai-training-docs";

function canManageAi(permissions: string[]) {
  return hasPermission(permissions, "workspace.ai_system") || hasPermission(permissions, "all");
}

function parseTags(raw: FormDataEntryValue | null): string[] {
  return String(raw || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function extractText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();

  if (
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".json") ||
    lower.endsWith(".csv")
  ) {
    return (await file.text()).trim();
  }

  if (lower.endsWith(".docx")) {
    const mammoth: any = await import("mammoth");
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    return String(result.value || "").trim();
  }

  return "";
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManageAi(session.permissions)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured" }, { status: 500 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Invalid multipart form" }, { status: 400 });

  const title = String(form.get("title") || "").trim();
  const category = String(form.get("category") || "custom").trim();
  const description = String(form.get("description") || "").trim();
  const manualNotes = String(form.get("manual_notes") || "").trim();
  const tags = parseTags(form.get("tags"));
  const isActive = String(form.get("is_active") || "true") !== "false";
  const fileEntry = form.get("file");
  const file = fileEntry instanceof File ? fileEntry : null;

  if (!title) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
  if (!file && !manualNotes) {
    return NextResponse.json({ ok: false, error: "Upload a document or add manual notes" }, { status: 400 });
  }
  if (file && file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ ok: false, error: "File too large (max 10 MB)" }, { status: 413 });
  }

  let extractedText = "";
  let filePath: string | null = null;

  if (file) {
    try {
      extractedText = await extractText(file);
    } catch (error: any) {
      return NextResponse.json(
        { ok: false, error: error?.message || "Could not extract text from that file" },
        { status: 400 }
      );
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    filePath = `knowledge/${Date.now()}-${safeName}`;
    const { error: uploadError } = await (supabaseAdmin as any).storage
      .from(BUCKET)
      .upload(filePath, new Uint8Array(await file.arrayBuffer()), {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });
    }
  }

  const contentText = [manualNotes, extractedText].filter(Boolean).join("\n\n").trim();
  const excerptSource = contentText || description || manualNotes || "";
  const contentExcerpt = excerptSource.slice(0, 900);

  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("ai_knowledge_documents")
    .insert({
      title,
      category,
      description: description || null,
      tags,
      content_text: contentText || null,
      content_excerpt: contentExcerpt || null,
      file_name: file?.name || null,
      file_path: filePath,
      file_mime: file?.type || null,
      file_size_bytes: file?.size || null,
      is_active: isActive,
      created_by: null,
    })
    .select("id, title, category, description, tags, content_excerpt, file_name, file_mime, file_size_bytes, is_active, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, document: data });
}
