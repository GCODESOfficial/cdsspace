import { NextResponse } from "next/server";
import { getCreateActor } from "@/lib/create-platform/session";
import { loadCreateDashboardData } from "@/lib/create-platform/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getCreateActor();
  if (!actor) return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  const data = await loadCreateDashboardData(actor);
  return NextResponse.json({ ok: true, authenticated: true, actor, data });
}
