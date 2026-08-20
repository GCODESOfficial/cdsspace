import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanPayload(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const copy = { ...source };
  delete copy.isSubmitting;
  delete copy.samplePreviews;
  delete copy.printPreviews;
  return copy;
}

async function signFiles(paths: string[]) {
  return Promise.all(paths.map(async (path) => {
    const { data } = await (supabaseAdmin as any).storage.from("sales-commerce").createSignedUrl(path, 60 * 60);
    return { path, url: data?.signedUrl || null, name: path.split("/").pop() || "File" };
  }));
}

export async function GET(request: Request) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (id && !UUID.test(id)) return NextResponse.json({ error: "Invalid merch draft." }, { status: 400 });
  let query = supabaseAdmin.from("merch_orders").select("*").eq("user_id", session.user.id).eq("status", "DRAFT");
  query = id ? query.eq("id", id) : query.order("updated_at", { ascending: false });
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ draft: null });
  const samplePaths = Array.isArray(data.sample_file_urls) ? data.sample_file_urls.map(String) : [];
  const printPaths = Array.isArray(data.print_file_urls) ? data.print_file_urls.map(String) : [];
  return NextResponse.json({ draft: data, samplePreviews: await signFiles(samplePaths), printPreviews: await signFiles(printPaths) });
}

export async function POST(request: Request) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const payload = cleanPayload(body.payload);
    if (JSON.stringify(payload).length > 500_000) return NextResponse.json({ error: "This draft is too large to autosave." }, { status: 413 });
    const productId = typeof payload.productId === "string" && UUID.test(payload.productId) ? payload.productId : null;
    if (!productId) return NextResponse.json({ skipped: true, reason: "Choose a merch product first." });
    const samplePaths = Array.isArray(payload.sampleFileUrls) ? payload.sampleFileUrls.map(String).filter(Boolean) : [];
    const printPaths = Array.isArray(payload.printFileUrls) ? payload.printFileUrls.map(String).filter(Boolean) : [];
    if ([...samplePaths, ...printPaths].some((path) => !path.startsWith(`${session.user.id}/merch/`) || path.includes(".."))) return NextResponse.json({ error: "One or more uploaded file paths are invalid." }, { status: 400 });
    const { data: product } = await supabaseAdmin.from("merch_products").select("name,is_custom").eq("id", productId).maybeSingle();
    if (!product) return NextResponse.json({ error: "Choose an available merch product." }, { status: 400 });
    const now = new Date().toISOString();
    const row = {
      title: String(payload.title || product.name).trim() || product.name,
      product_id: productId,
      is_custom: product.is_custom,
      quantity: Math.max(1, Math.min(100000, Number(payload.quantity) || 1)),
      execution_mode: payload.executionMode === "create" ? "create" : "upload",
      design_brief: String(payload.designBrief || "") || null,
      reference_notes: String(payload.referenceNotes || "") || null,
      sample_file_urls: samplePaths,
      print_file_urls: printPaths,
      draft_payload: payload,
      draft_step: Math.max(1, Math.min(3, Number(body.step) || 1)),
      updated_at: now,
    };
    const draftId = typeof body.draftId === "string" && UUID.test(body.draftId) ? body.draftId : null;
    if (draftId) {
      const { data, error } = await supabaseAdmin.from("merch_orders").update(row).eq("id", draftId).eq("user_id", session.user.id).eq("status", "DRAFT").select().maybeSingle();
      if (error) throw error;
      if (data) return NextResponse.json({ draft: data, savedAt: now });
    }
    const { count } = await supabaseAdmin.from("merch_orders").select("*", { count: "exact", head: true }).eq("user_id", session.user.id);
    const displayId = `MRC-${String((count ?? 0) + 1).padStart(3, "0")}`;
    const { data, error } = await supabaseAdmin.from("merch_orders").insert({ ...row, user_id: session.user.id, display_id: displayId, status: "DRAFT", currency: "NGN", details: {} }).select().single();
    if (error) throw error;
    return NextResponse.json({ draft: data, savedAt: now });
  } catch (error) {
    console.error("[merch-draft] autosave failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The merch draft could not be saved." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "Invalid merch draft." }, { status: 400 });
  const { error } = await supabaseAdmin.from("merch_orders").delete().eq("id", id).eq("user_id", session.user.id).eq("status", "DRAFT");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
