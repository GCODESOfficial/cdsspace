import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getAdminSessionAsync, type AdminSession } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { getGlashDbAdmin, getSupabaseAdmin } from "@/lib/supabase";
import { adminMobileJson } from "@/lib/admin-mobile";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

/**
 * Dashboard quick actions for the app's admin portal (Feature Brands, Manage Ads,
 * Career Link and the Featured Works card). The web dashboard does these from the
 * browser (src/lib/storage-service.ts and components/featured-brands-*.tsx query
 * `brands`, `advertisements` and `carrier_links` directly and upload ad images to the
 * `media` bucket), so the app goes through these server helpers instead.
 */

export const MAX_FEATURED = 8;
export const MAX_ADS = 10;
const MAX_AD_BYTES = 10 * 1024 * 1024;

export const workspaceFail = (error: string, status: number) => adminMobileJson({ ok: false, error }, status);

/** Admin session holding any one of `keys` (super admins always pass). */
export async function requireAnyAdmin(
  req: NextRequest,
  keys: string[],
): Promise<{ session: AdminSession | null; denied: ReturnType<typeof workspaceFail> | null }> {
  const session = await getAdminSessionAsync(req);
  if (!session) return { session: null, denied: workspaceFail("Unauthorized", 401) };
  if (session.role === "super_admin" || keys.some((key) => hasPermission(session.permissions || [], key))) {
    return { session, denied: null };
  }
  return { session, denied: workspaceFail("Forbidden", 403) };
}

export const DASHBOARD_READ = ["dashboard", "dashboard.view", "dashboard.quick_actions", "dashboard.works_table"];
export const DASHBOARD_ACTIONS = ["dashboard.quick_actions"];

const db = (): any => getSupabaseAdmin();

/** Featured works in brand order (components/featured-brands-list.tsx). */
export async function loadFeaturedWorks() {
  const { data: brandRows, error } = await db().from("brands").select("name, order").eq("selected", true).order("order");
  if (error) throw new Error(error.message || "Failed to load featured works");
  if (!brandRows?.length) return [];
  const titles: string[] = brandRows.map((b: any) => b.name);
  const { data: works, error: worksError } = await db().from("works").select("id, title, category, cover_image, created_at").in("title", titles);
  if (worksError) throw new Error(worksError.message || "Failed to load featured works");
  return titles.map((title) => (works || []).find((w: any) => w.title === title)).filter(Boolean);
}

/** Replaces the featured selection (components/featured-brands-modal.tsx handleSaveChanges). */
export async function saveFeaturedWorks(workIds: string[]) {
  const ids = workIds.filter((id) => typeof id === "string" && id).slice(0, MAX_FEATURED);
  let ordered: any[] = [];
  if (ids.length) {
    const { data, error } = await db().from("works").select("id, title").in("id", ids);
    if (error) throw new Error(error.message || "Failed to load works");
    ordered = ids.map((id) => (data || []).find((w: any) => String(w.id) === String(id))).filter(Boolean);
  }
  const { error: deleteError } = await db().from("brands").delete().eq("selected", true);
  if (deleteError) throw new Error(deleteError.message || "Failed to save changes");
  if (ordered.length) {
    const now = new Date().toISOString();
    const { error: insertError } = await db()
      .from("brands")
      .insert(ordered.map((work, index) => ({ name: work.title, order: index + 1, selected: true, created_at: now })));
    if (insertError) throw new Error(insertError.message || "Failed to save changes");
  }
  return loadFeaturedWorks();
}

const mapAd = (row: any) => ({ id: row.id, image_url: row.image_path, link: row.link, created_at: row.created_at });

export async function loadAds() {
  const { data, error } = await db().from("advertisements").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Failed to load advertisements.");
  return (data || []).map(mapAd);
}

/** Uploads an ad image to media/advertisements (lib/storage-service.ts uploadFile). */
export async function uploadAdImage(file: File) {
  let safe: Awaited<ReturnType<typeof assertSafeUpload>>;
  try {
    safe = await assertSafeUpload(file, { allow: ["image"], maxBytes: MAX_AD_BYTES });
  } catch (error) {
    throw new UploadSecurityError(error instanceof Error ? error.message : "Upload blocked.", error instanceof UploadSecurityError ? error.status : 400);
  }
  const storage: any = getGlashDbAdmin();
  if (!storage?.storage) throw new Error("Storage is not configured.");
  const path = `advertisements/${uuidv4()}.${safe.ext}`;
  const { error } = await storage.storage.from("media").upload(path, safe.buffer, { contentType: safe.contentType, upsert: false });
  if (error) throw new Error(error.message || "Upload failed.");
  return storage.storage.from("media").getPublicUrl(path).data.publicUrl as string;
}

/** Best-effort removal of a media file by its public URL (lib/storage-service.ts deleteFile). */
export async function deleteStorageFile(url: string | null | undefined) {
  if (!url) return;
  try {
    const match = new URL(url).pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!match) return;
    const storage: any = getGlashDbAdmin();
    await storage?.storage?.from(match[1]).remove([decodeURIComponent(match[2])]);
  } catch {
    // A stale or missing file must not block the row change.
  }
}

export async function addAd(imageUrl: string, link: string) {
  const { count } = await db().from("advertisements").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_ADS) throw new UploadSecurityError(`Ad limit of ${MAX_ADS} reached. Please delete an ad before adding a new one.`, 409);
  const { error } = await db().from("advertisements").insert([{ image_path: imageUrl, link }]);
  if (error) throw new Error(error.message || "Failed to add advertisement.");
}

export async function updateAd(id: string, patch: { link?: string; imageUrl?: string }) {
  const { data: existing } = await db().from("advertisements").select("image_path").eq("id", id).maybeSingle();
  const payload: Record<string, string> = {};
  if (patch.link !== undefined) payload.link = patch.link;
  if (patch.imageUrl) payload.image_path = patch.imageUrl;
  const { error } = await db().from("advertisements").update(payload).eq("id", id);
  if (error) throw new Error(error.message || "Failed to update advertisement.");
  if (patch.imageUrl && existing?.image_path && existing.image_path !== patch.imageUrl) await deleteStorageFile(existing.image_path);
}

export async function deleteAd(id: string) {
  const { data: existing } = await db().from("advertisements").select("image_path").eq("id", id).maybeSingle();
  await deleteStorageFile(existing?.image_path);
  const { error } = await db().from("advertisements").delete().eq("id", id);
  if (error) throw new Error(error.message || "Failed to delete advertisement.");
}

export async function loadCareerLink() {
  const { data } = await db().from("carrier_links").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? { id: data.id, url: data.url, created_at: data.created_at } : null;
}

/** Single-link table: replace whatever is there (lib/storage-service.ts updateCarrierLink). */
export async function saveCareerLink(url: string) {
  await db().from("carrier_links").delete().neq("id", "");
  const { error } = await db().from("carrier_links").insert([{ url }]);
  if (error) throw new Error(error.message || "Failed to update carrier link");
  return loadCareerLink();
}

export const errorStatus = (error: unknown) => (error instanceof UploadSecurityError ? error.status : 500);
export const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
