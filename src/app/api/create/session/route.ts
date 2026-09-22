import { NextResponse } from "next/server";
import { getCreateActorFromRequest, publicCreateActor } from "@/lib/create-platform/session";
import { loadCreateDashboardData } from "@/lib/create-platform/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getCreateActorFromRequest(request);
  const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
  if (!actor) return NextResponse.json({ ok: false, authenticated: false }, { status: 401, headers });
  const data = await loadCreateDashboardData(actor);
  return NextResponse.json({ ok: true, authenticated: true, actor: publicCreateActor(actor), data }, { headers });
}
