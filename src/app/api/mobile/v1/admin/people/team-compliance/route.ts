import { NextRequest } from "next/server";
import { POST as webPost } from "@/app/api/admin/team-compliance/route";
import { forwardWithTrustedOrigin } from "@/lib/admin-mobile-people";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// App writes for /admin/team-compliance (SOP and book drafts, saves, deletes, loan
// and overnight reviews). Same handler, permissions and audit as
// POST /api/admin/team-compliance; see src/lib/admin-mobile-people.ts for the Origin.
export async function POST(req: NextRequest) {
  return forwardWithTrustedOrigin(req, webPost, "/api/admin/team-compliance");
}
