import { NextRequest, NextResponse } from "next/server";
import { consumeHandoffCode } from "@/lib/mobile-handoff";
import { safeClientPath } from "@/lib/client-account";
import { setClientDashboardSessionOnResponse } from "@/lib/client-dashboard-session";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Opened in the app's in-app browser: spends the code, signs this browser in as
// the client (the normal web dashboard session) and continues to the page.
export async function GET(request: NextRequest) {
  const spent = await consumeHandoffCode("web_session", request.nextUrl.searchParams.get("code"));
  if (!spent) return NextResponse.redirect(new URL("/login?error=session_expired", request.url));

  const profile = await glashMaybeOne<{ account_status: string }>(
    "select account_status from public.profiles where id = $1::uuid limit 1",
    [spent.user_id],
  );
  if (profile?.account_status !== "active") return NextResponse.redirect(new URL("/login?account=closed", request.url));

  const target = new URL(safeClientPath(spent.target_path, "/dashboard"), request.url);
  return setClientDashboardSessionOnResponse(NextResponse.redirect(target), { id: spent.user_id, email: spent.email });
}
