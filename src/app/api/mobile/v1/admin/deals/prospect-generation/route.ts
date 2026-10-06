import { NextRequest } from "next/server";
import { POST as generationPost } from "@/app/api/admin/deals/prospect-generation/route";
import { forwardAppMutation } from "@/lib/admin-mobile-deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Prospect generation writes from the app (import, research queue, promote,
// outreach): the web handler, same body and response. Reads go straight to
// GET /api/admin/deals/prospect-generation.
export async function POST(req: NextRequest) {
  return forwardAppMutation(req, generationPost);
}
