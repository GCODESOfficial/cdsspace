import { NextResponse } from "next/server";
import { getToolActor } from "@/lib/team-tools-auth";
import { getClientAccountState } from "@/lib/client-account";
import { lastSeen } from "@/lib/presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/presence?keys=team:<id>,client:<id>,cds,superadmin
 * -> { lastSeen: { [key]: ISO time | null } } for "online" / "last seen" in chats.
 * Team members and admins may ask about anyone; a client only about CDS Space
 * (`cds`), the people they chat with.
 */
export async function GET(request: Request) {
  const actor = await getToolActor().catch(() => null);
  const account = actor ? null : await getClientAccountState().catch(() => null);
  if (!actor && !account?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let keys = Array.from(new Set(
    (new URL(request.url).searchParams.get("keys") || "").split(",").map((key) => key.trim()).filter(Boolean),
  )).slice(0, 40);
  if (!actor) keys = keys.filter((key) => key === "cds");

  return NextResponse.json({ lastSeen: await lastSeen(keys) }, { headers: { "Cache-Control": "no-store" } });
}
