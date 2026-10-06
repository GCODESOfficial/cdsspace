import { NextRequest } from "next/server";
import { POST as webPost } from "@/app/api/admin/team-compliance/upload/route";
import { forwardWithTrustedOrigin } from "@/lib/admin-mobile-people";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// App upload of SOP images/videos (multipart file + sop_id, as
// POST /api/admin/team-compliance/upload).
export async function POST(req: NextRequest) {
  return forwardWithTrustedOrigin(req, webPost, "/api/admin/team-compliance/upload");
}
