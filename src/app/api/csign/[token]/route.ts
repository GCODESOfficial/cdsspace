/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public GET - fetch request + attached doc body. Marks as opened on first view.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Invalid" }, { status: 400 });
  const db = supabaseAdmin as any;
  const { data: reqRow } = await db
    .from("team_signature_requests")
    .select("id, document_id, status, access_token, signed_png_url, signed_at, signature_x, signature_y, signature_page")
    .eq("access_token", token)
    .maybeSingle();
  if (!reqRow) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (reqRow.status === "pending") {
    await db.from("team_signature_requests").update({ status: "opened" }).eq("id", reqRow.id);
    reqRow.status = "opened";
  }

  let doc: any = null;
  if (reqRow.document_id) {
    const { data: d } = await db
      .from("team_cdocs")
      .select("id, title, body, theme, stamped, share_token")
      .eq("id", reqRow.document_id)
      .maybeSingle();
    doc = d || null;
  }

  return NextResponse.json({ ok: true, request: reqRow, team_cdocs: doc });
}

// Public PUT - submit signature
export async function PUT(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Invalid" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const { signed_png_url, signature_x, signature_y, signature_page } = body;
  if (!signed_png_url) return NextResponse.json({ ok: false, error: "signed_png_url required" }, { status: 400 });

  const db = supabaseAdmin as any;
  const { data: updated, error } = await db
    .from("team_signature_requests")
    .update({
      status: "signed",
      signed_png_url,
      signature_x: signature_x ?? null,
      signature_y: signature_y ?? null,
      signature_page: signature_page ?? null,
      signed_at: new Date().toISOString(),
    })
    .eq("access_token", token)
    .select("id, document_id, requested_by, signer_team_member_id")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (updated.document_id) {
    await db.from("team_cdocs_activity").insert({
      cdoc_id: updated.document_id,
      actor_is_admin: false,
      actor_name: "Signer",
      action: "signed",
    });
  }
  if (updated.requested_by) {
    await db.from("team_notifications").insert({
      recipient_id: updated.requested_by,
      kind: "csign_request",
      title: "A document you sent was signed",
      body: "Your signature request was completed.",
      link: `/team/csign`,
      signature_request_id: updated.id,
    });
  }
  return NextResponse.json({ ok: true });
}

// Public DELETE - decline to sign
export async function DELETE(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Invalid" }, { status: 400 });
  const db = supabaseAdmin as any;
  const { error } = await db.from("team_signature_requests").update({ status: "declined" }).eq("access_token", token);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
