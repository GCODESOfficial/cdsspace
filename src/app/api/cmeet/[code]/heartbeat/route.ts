import { NextResponse } from "next/server";
import { touchCmeet } from "@/lib/cmeet-autoclose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/cmeet/[code]/heartbeat - called periodically by an in-room client
// to signal presence. The room code is the shared secret, so guests in the
// room can keep it alive too; it only bumps last_active_at on live meetings.
export async function POST(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!code) return NextResponse.json({ ok: false, error: "Invalid" }, { status: 400 });
  await touchCmeet(code);
  return NextResponse.json({ ok: true });
}
