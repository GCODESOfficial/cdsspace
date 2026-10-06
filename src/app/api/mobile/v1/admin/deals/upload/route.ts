import { NextRequest } from "next/server";
import { POST as uploadPost } from "@/app/api/admin/deals/upload/route";
import { forwardAppMutation } from "@/lib/admin-mobile-deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Proposal cover upload from the app: multipart field "file", forwarded as-is
// to the web handler (A4 portrait check, WebP conversion, deals-assets bucket).
export async function POST(req: NextRequest) {
  return forwardAppMutation(req, uploadPost);
}
