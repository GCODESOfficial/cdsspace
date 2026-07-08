/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// Public - no auth. Read-only shape.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Invalid" }, { status: 400 });
  const db = supabaseAdmin as any;
  const { data } = await db
    .from("team_cdocs")
    .select("id, title, body, theme, stamped, share_token, last_saved_at")
    .eq("share_token", token)
    .maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, doc: data });
}
