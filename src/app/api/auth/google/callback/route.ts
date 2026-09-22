import { NextRequest } from "next/server";
import { completeDirectGoogleLogin } from "@/lib/auth/google-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return completeDirectGoogleLogin(request);
}
