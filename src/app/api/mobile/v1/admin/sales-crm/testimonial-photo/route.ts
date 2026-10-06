import { NextRequest, NextResponse } from "next/server";
import { UploadSecurityError } from "@/lib/upload-security";
import {
  removeTestimonialPhotos,
  requireAnyAdminPermission,
  uploadTestimonialPhoto,
} from "@/lib/admin-mobile-sales-crm-testimonials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Testimonial client photos for the mobile admin app (the web page talks to the
 * `testimonials` storage bucket from the browser).
 *
 *   POST   multipart { file }        → { ok, url }   (testimonials.create | testimonials.edit)
 *   DELETE { urls: [publicUrl, ...] } → { ok, removed } (testimonials.edit | testimonials.delete)
 */
export async function POST(req: NextRequest) {
  const denied = await requireAnyAdminPermission(req, ["testimonials.create", "testimonials.edit"]);
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
  }
  try {
    const { url } = await uploadTestimonialPhoto(file);
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    const status = error instanceof UploadSecurityError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Photo upload failed." }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAnyAdminPermission(req, ["testimonials.edit", "testimonials.delete"]);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { urls?: unknown; url?: unknown };
  const urls = Array.isArray(body.urls) ? body.urls.slice(0, 200) : body.url ? [body.url] : [];
  try {
    const removed = await removeTestimonialPhotos(urls);
    return NextResponse.json({ ok: true, removed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Photo could not be removed." }, { status: 500 });
  }
}
