import { NextResponse } from "next/server";
import { createClient } from "@/lib/glashdb/server";
import { clearClientDashboardSessionOnResponse } from "@/lib/client-dashboard-session";
import { clearMarketerDashboardSessionOnResponse } from "@/lib/marketer-dashboard-session";

export async function POST() {
  const db = await createClient();
  await db.auth.signOut();
  return clearMarketerDashboardSessionOnResponse(
    clearClientDashboardSessionOnResponse(NextResponse.json({ ok: true })),
  );
}
