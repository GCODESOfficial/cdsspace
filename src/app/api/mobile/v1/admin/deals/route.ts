import { NextRequest } from "next/server";
import { POST as dealsPost } from "@/app/api/admin/deals/route";
import { forwardAppMutation } from "@/lib/admin-mobile-deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Deals writes from the app (proposals, audits, checklist): the web handler,
// same body and response. Reads go straight to GET /api/admin/deals.
export async function POST(req: NextRequest) {
  return forwardAppMutation(req, dealsPost);
}
