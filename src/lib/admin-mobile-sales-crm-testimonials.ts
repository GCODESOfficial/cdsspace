/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { assertSafeImage } from "@/lib/upload-security";

/**
 * Testimonial photos for the mobile admin app. The web page
 * (src/app/admin/testimonials/page.tsx) uploads to and removes from the public
 * `testimonials` storage bucket straight from the browser; the app has no
 * storage client, so it goes through these helpers with the same permissions
 * the testimonials table uses.
 */

export const TESTIMONIAL_BUCKET = "testimonials";

/** Passes for super admins and sub-admins holding any one of `keys`. */
export async function requireAnyAdminPermission(req: NextRequest, keys: string[]) {
  const session = await getAdminSessionAsync(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "super_admin") return null;
  if (keys.some((key) => hasPermission(session.permissions || [], key))) return null;
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function storage() {
  const db = getGlashDbAdmin() as any;
  if (!db?.storage) throw new Error("Storage is not configured.");
  return db.storage.from(TESTIMONIAL_BUCKET);
}

/** Uploads a validated image under a random name at the bucket root, like the web page. */
export async function uploadTestimonialPhoto(file: File) {
  const safe = await assertSafeImage(file, { maxBytes: 8 * 1024 * 1024, maxDimension: 8000 });
  const fileName = `${Date.now()}-${randomBytes(6).toString("hex")}.${safe.ext}`;
  const bucket = storage();
  const { error } = await bucket.upload(fileName, safe.buffer, { contentType: safe.contentType, upsert: false });
  if (error) throw new Error(error.message || "Photo upload failed.");
  const { data } = bucket.getPublicUrl(fileName);
  return { url: data.publicUrl as string, path: fileName };
}

/** "…/testimonials/<file>" → "<file>" (same split as the web page); rejects anything else. */
export function testimonialPhotoPath(url: unknown): string | null {
  if (typeof url !== "string" || !url.includes(`/${TESTIMONIAL_BUCKET}/`)) return null;
  const path = (url.split(`/${TESTIMONIAL_BUCKET}/`).pop() || "").split("?")[0];
  return /^[A-Za-z0-9._-]{1,200}$/.test(path) && !path.includes("..") ? path : null;
}

export async function removeTestimonialPhotos(urls: unknown[]) {
  const paths = urls.map(testimonialPhotoPath).filter((p): p is string => Boolean(p));
  if (!paths.length) return 0;
  const { error } = await storage().remove(paths);
  if (error) throw new Error(error.message || "Photo could not be removed.");
  return paths.length;
}
