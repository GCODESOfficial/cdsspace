import { NextRequest } from "next/server";
import { adminMobileJson } from "@/lib/admin-mobile";
import {
  DASHBOARD_READ,
  errorMessage,
  loadAds,
  loadCareerLink,
  loadFeaturedWorks,
  requireAnyAdmin,
  workspaceFail,
} from "@/lib/admin-mobile-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET → { ok, featured: [{ id, title, category, cover_image }], ads: [{ id, image_url, link, created_at }],
 *         careerLink: { id, url, created_at } | null }
 * The browser-direct reads of the web dashboard (Featured Works card, Manage Ads, Career Link).
 */
export async function GET(req: NextRequest) {
  const { denied } = await requireAnyAdmin(req, DASHBOARD_READ);
  if (denied) return denied;
  try {
    const [featured, ads, careerLink] = await Promise.all([loadFeaturedWorks(), loadAds(), loadCareerLink()]);
    return adminMobileJson({ ok: true, featured, ads, careerLink });
  } catch (error) {
    return workspaceFail(errorMessage(error, "Could not load the dashboard"), 500);
  }
}
