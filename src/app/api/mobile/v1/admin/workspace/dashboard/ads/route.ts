import { NextRequest } from "next/server";
import { adminMobileJson } from "@/lib/admin-mobile";
import {
  DASHBOARD_ACTIONS,
  addAd,
  deleteAd,
  deleteStorageFile,
  errorMessage,
  errorStatus,
  loadAds,
  requireAnyAdmin,
  updateAd,
  uploadAdImage,
  workspaceFail,
} from "@/lib/admin-mobile-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manage Ads (components/advertisement-modal.tsx). Every write answers { ok, ads }.
 *   POST   multipart { file, link }          → upload to media/advertisements + insert (max 10)
 *   PATCH  multipart { id, link, file? }     → update link, optionally replace the image
 *   DELETE ?id=<id>                          → remove the image and the row
 */
async function readForm(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return null;
  const file = form.get("file");
  return {
    id: String(form.get("id") || "").trim(),
    link: String(form.get("link") || "").trim(),
    file: file instanceof File && file.size > 0 ? file : null,
  };
}

export async function POST(req: NextRequest) {
  const { denied } = await requireAnyAdmin(req, DASHBOARD_ACTIONS);
  if (denied) return denied;
  const form = await readForm(req);
  if (!form) return workspaceFail("Invalid upload payload.", 400);
  if (!form.file || !form.link) return workspaceFail("Upload an image and provide a valid link.", 400);
  let imageUrl: string | null = null;
  try {
    imageUrl = await uploadAdImage(form.file);
    await addAd(imageUrl, form.link);
    return adminMobileJson({ ok: true, ads: await loadAds() });
  } catch (error) {
    await deleteStorageFile(imageUrl);
    return workspaceFail(errorMessage(error, "Unable to upload the ad."), errorStatus(error));
  }
}

export async function PATCH(req: NextRequest) {
  const { denied } = await requireAnyAdmin(req, DASHBOARD_ACTIONS);
  if (denied) return denied;
  const form = await readForm(req);
  if (!form) return workspaceFail("Invalid upload payload.", 400);
  if (!form.id) return workspaceFail("id is required", 400);
  if (!form.link) return workspaceFail("Provide a valid link.", 400);
  try {
    const imageUrl = form.file ? await uploadAdImage(form.file) : undefined;
    await updateAd(form.id, { link: form.link, imageUrl });
    return adminMobileJson({ ok: true, ads: await loadAds() });
  } catch (error) {
    return workspaceFail(errorMessage(error, "Could not update ad."), errorStatus(error));
  }
}

export async function DELETE(req: NextRequest) {
  const { denied } = await requireAnyAdmin(req, DASHBOARD_ACTIONS);
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return workspaceFail("id is required", 400);
  try {
    await deleteAd(id);
    return adminMobileJson({ ok: true, ads: await loadAds() });
  } catch (error) {
    return workspaceFail(errorMessage(error, "Could not delete advertisement."), 500);
  }
}
