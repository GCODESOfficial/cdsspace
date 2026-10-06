import { NextRequest } from "next/server";
import { adminMobileJson } from "@/lib/admin-mobile";
import { DASHBOARD_ACTIONS, MAX_FEATURED, errorMessage, requireAnyAdmin, saveFeaturedWorks, workspaceFail } from "@/lib/admin-mobile-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT { workIds: string[] } (in order, max 8) → { ok, featured }: Feature Brands "Save changes". */
export async function PUT(req: NextRequest) {
  const { denied } = await requireAnyAdmin(req, DASHBOARD_ACTIONS);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { workIds?: unknown } | null;
  if (!Array.isArray(body?.workIds)) return workspaceFail("workIds is required", 400);
  if (body.workIds.length > MAX_FEATURED) return workspaceFail(`Select up to ${MAX_FEATURED} works`, 400);
  try {
    const featured = await saveFeaturedWorks(body.workIds.map(String));
    return adminMobileJson({ ok: true, featured });
  } catch (error) {
    return workspaceFail(errorMessage(error, "Failed to save changes"), 500);
  }
}
