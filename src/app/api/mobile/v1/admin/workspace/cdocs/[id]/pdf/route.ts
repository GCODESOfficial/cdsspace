import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { adminCDocPdfResponse } from "@/lib/admin-mobile-workspace-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin app cDocs editor "Download PDF" (the web editor builds it in the browser).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin(req, "workspace.cdocs");
  if (denied) return denied;
  const { id } = await params;
  return adminCDocPdfResponse(id);
}
