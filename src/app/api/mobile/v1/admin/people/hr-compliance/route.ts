import { NextRequest } from "next/server";
import { POST as webPost } from "@/app/api/admin/hr/compliance/route";
import { forwardWithTrustedOrigin } from "@/lib/admin-mobile-people";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// App writes for /admin/hrm/compliance (save_draft, discard_draft, create_record,
// update_status, mark_birthday_celebrated). Same handler, permissions and audit as
// POST /api/admin/hr/compliance; see src/lib/admin-mobile-people.ts for the Origin.
export async function POST(req: NextRequest) {
  return forwardWithTrustedOrigin(req, webPost, "/api/admin/hr/compliance");
}
