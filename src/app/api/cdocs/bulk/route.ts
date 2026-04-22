/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { ids, action } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ ok: false, error: "ids required" }, { status: 400 });
  }
  if (!["archive", "unarchive", "delete"].includes(action)) {
    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  }
  const db = supabaseAdmin as any;

  // Scope to caller's own docs unless admin
  let scope = db.from("team_cdocs").update({}).in("id", ids);
  if (!actor.is_admin && actor.kind === "team") scope = scope.eq("created_by", actor.id);

  if (action === "archive") {
    await db.from("team_cdocs").update({ archived: true, archived_at: new Date().toISOString() }).in("id", ids);
  } else if (action === "unarchive") {
    await db.from("team_cdocs").update({ archived: false, archived_at: null }).in("id", ids);
  } else {
    // Skip any with signed requests
    const { data: signed } = await db.from("team_signature_requests").select("document_id").in("document_id", ids).eq("status", "signed");
    const blocked = new Set((signed || []).map((r: any) => r.document_id));
    const targets = ids.filter((i: string) => !blocked.has(i));
    if (targets.length) await db.from("team_cdocs").delete().in("id", targets);
  }
  return NextResponse.json({ ok: true });
}
