import { NextRequest } from "next/server";
import { POST as webPost } from "@/app/api/admin/hr/compliance/upload/route";
import { forwardWithTrustedOrigin } from "@/lib/admin-mobile-people";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// App upload of an HR record with its document (multipart, same fields as
// POST /api/admin/hr/compliance/upload).
export async function POST(req: NextRequest) {
  return forwardWithTrustedOrigin(req, webPost, "/api/admin/hr/compliance/upload");
}
