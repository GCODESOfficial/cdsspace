import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanPayload(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const copy = { ...source };
  delete copy.assets;
  delete copy.readyFiles;
  delete copy.readyFile;
  delete copy.isSubmitting;
  delete copy.mockupUrls;
  delete copy.mockupTaskIds;
  delete copy.mockupStatuses;
  return copy;
}

async function signedArtwork(paths: string[]) {
  return paths.map((path) => ({
    path,
    url: `/api/banners/file?path=${encodeURIComponent(path)}`,
    name: path.split("/").pop() || "Artwork",
  }));
}

export async function GET(request: Request) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestedId = new URL(request.url).searchParams.get("id");
  if (requestedId && !UUID.test(requestedId)) {
    return NextResponse.json({ error: "Invalid banner draft." }, { status: 400 });
  }

  let query = supabaseAdmin
    .from("banner_requests")
    .select("*")
    .eq("user_id", session.user.id)
    .eq("status", "DRAFT");
  query = requestedId
    ? query.eq("id", requestedId)
    : query.order("updated_at", { ascending: false });
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ draft: null });

  const paths = Array.isArray(data.ready_file_urls) ? data.ready_file_urls.map(String) : data.ready_file_url ? [String(data.ready_file_url)] : [];
  return NextResponse.json({ draft: data, artworkPreviews: await signedArtwork(paths) });
}

export async function POST(request: Request) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const payload = cleanPayload(body.payload);
    const encoded = JSON.stringify(payload);
    if (encoded.length > 500_000) return NextResponse.json({ error: "This draft is too large to autosave." }, { status: 413 });

    const paths = Array.isArray(payload.readyFileUrls) ? payload.readyFileUrls.map(String).filter(Boolean) : [];
    if (paths.some((path) => !path.startsWith(`${session.user.id}/`) || path.includes(".."))) {
      return NextResponse.json({ error: "One or more artwork paths are invalid." }, { status: 400 });
    }

    const draftId = typeof body.draftId === "string" && UUID.test(body.draftId) ? body.draftId : null;
    const step = Math.max(1, Math.min(3, Number(body.step) || 1));
    const custom = payload.isCustom === true;
    const productId = typeof payload.productId === "string" && UUID.test(payload.productId) ? payload.productId : null;
    if (!custom && !productId) return NextResponse.json({ skipped: true, reason: "Choose a banner first." });

    let productName = "Banner draft";
    if (productId) {
      const { data: product } = await supabaseAdmin.from("banner_products").select("name").eq("id", productId).maybeSingle();
      productName = product?.name || productName;
    }
    const size = String(payload.size || (custom ? `${payload.customWidth || "?"}${payload.dimensionUnit || "cm"} × ${payload.customHeight || "?"}${payload.dimensionUnit || "cm"}` : "Pending"));
    const now = new Date().toISOString();
    const row = {
      title: custom ? `Custom banner · ${size}` : productName,
      product_id: productId,
      is_custom: custom,
      custom_width: custom ? Math.max(0, Number(payload.customWidth) || 0) || null : null,
      custom_height: custom ? Math.max(0, Number(payload.customHeight) || 0) || null : null,
      dimension_unit: custom ? String(payload.dimensionUnit || "cm") : null,
      size,
      quality: payload.quality === "Premium" ? "Premium" : "Standard",
      environment: payload.environment === "Outdoor" ? "Outdoor" : "Indoor",
      execution_mode: payload.executionMode === "Upload" ? "Upload" : "Create",
      design_brief: String(payload.designBrief || "") || null,
      design_content: String(payload.designContent || "") || null,
      reference_notes: String(payload.referenceNotes || "") || null,
      asset_urls: Array.isArray(payload.assetUrls) ? payload.assetUrls : [],
      ready_file_url: paths[0] || null,
      ready_file_urls: paths,
      quantity: Math.max(1, Math.min(1000, Number(payload.quantity) || 1)),
      fulfillment_type: payload.fulfillmentType === "Pickup Station" ? "Pickup Station" : "Door-to-door",
      country: String((payload.shipping as Record<string, unknown> | undefined)?.country || "") || null,
      state: String((payload.shipping as Record<string, unknown> | undefined)?.state || "") || null,
      city: String((payload.shipping as Record<string, unknown> | undefined)?.city || "") || null,
      street_address: String((payload.shipping as Record<string, unknown> | undefined)?.streetAddress || "") || null,
      recipient_name: String((payload.shipping as Record<string, unknown> | undefined)?.recipientName || "") || null,
      phone_number: String((payload.shipping as Record<string, unknown> | undefined)?.phoneNumber || "") || null,
      instructions: String((payload.shipping as Record<string, unknown> | undefined)?.instructions || "") || null,
      pickup_station: String((payload.shipping as Record<string, unknown> | undefined)?.pickupStation || "") || null,
      draft_step: step,
      draft_payload: payload,
      discount_code: String(payload.discountCode || "") || null,
      updated_at: now,
    };

    if (draftId) {
      const { data, error } = await supabaseAdmin.from("banner_requests").update(row).eq("id", draftId).eq("user_id", session.user.id).eq("status", "DRAFT").select().maybeSingle();
      if (error) throw error;
      if (data) return NextResponse.json({ draft: data, savedAt: now });
    }

    const { count } = await supabaseAdmin.from("banner_requests").select("*", { count: "exact", head: true }).eq("user_id", session.user.id);
    const displayId = `BNR-${String((count ?? 0) + 1).padStart(3, "0")}`;
    const { data, error } = await supabaseAdmin.from("banner_requests").insert({ ...row, user_id: session.user.id, display_id: displayId, status: "DRAFT" }).select().single();
    if (error) throw error;
    return NextResponse.json({ draft: data, savedAt: now });
  } catch (error) {
    console.error("[banner-draft] autosave failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The banner draft could not be saved." }, { status: 500 });
  }
}
