import { NextRequest } from "next/server";
import { adminMobileJson } from "@/lib/admin-mobile";
import { DASHBOARD_ACTIONS, errorMessage, requireAnyAdmin, saveCareerLink, workspaceFail } from "@/lib/admin-mobile-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT { url } → { ok, careerLink }: the dashboard's Career Link quick action. */
export async function PUT(req: NextRequest) {
  const { denied } = await requireAnyAdmin(req, DASHBOARD_ACTIONS);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  const url = String(body?.url || "").trim();
  if (!url) return workspaceFail("Please enter a valid URL", 400);
  try {
    return adminMobileJson({ ok: true, careerLink: await saveCareerLink(url) });
  } catch (error) {
    return workspaceFail(errorMessage(error, "Failed to update carrier link"), 500);
  }
}
