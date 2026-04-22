import { NextResponse } from "next/server";
import { getTeamSession } from "@/lib/team-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  return NextResponse.json({ ok: true, authenticated: true, member: session });
}
