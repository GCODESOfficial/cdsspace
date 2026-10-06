import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { adminSignedPdfResponse } from "@/lib/admin-mobile-workspace-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin app cSign: a signed request as a PDF (the web builds it in the browser).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin(req, "workspace.csign");
  if (denied) return denied;
  const { id } = await params;
  return adminSignedPdfResponse(id);
}
