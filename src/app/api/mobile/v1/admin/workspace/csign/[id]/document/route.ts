import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { adminSignRequestDocumentPdfResponse } from "@/lib/admin-mobile-workspace-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin app cSign: the request's document as a PDF, shown before signing.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin(req, "workspace.csign");
  if (denied) return denied;
  const { id } = await params;
  return adminSignRequestDocumentPdfResponse(id);
}
