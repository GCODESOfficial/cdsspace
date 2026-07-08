/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function accessToken() {
  return crypto.randomBytes(16).toString("hex");
}

// GET - list requests visible to the caller
export async function GET() {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = supabaseAdmin as any;

  // Admin sees everything; team member sees requests they sent or are assigned to
  let q = db
    .from("team_signature_requests")
    .select("id, document_id, status, access_token, signer_id, signer_email, signed_png_url, signed_at, requested_by, requested_by_admin, archived_at, created_at")
    .order("created_at", { ascending: false });
  if (!actor.is_admin && actor.kind === "team") {
    q = q.or(`requested_by.eq.${actor.id},signer_team_member_id.eq.${actor.id}`);
  }
  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Hydrate document titles
  const docIds = Array.from(new Set((rows || []).map((r: any) => r.document_id).filter(Boolean)));
  const docMap: Record<string, { id: string; title: string; share_token: string; theme: string }> = {};
  if (docIds.length) {
    const { data: docs } = await db.from("team_cdocs").select("id, title, share_token, theme").in("id", docIds);
    (docs || []).forEach((d: any) => { docMap[d.id] = d; });
  }
  const enriched = (rows || []).map((r: any) => ({
    ...r,
    team_cdocs: docMap[r.document_id] || null,
    _role:
      r.requested_by === actor.id ? "sent" :
      r.signer_id === actor.id ? "to_sign" :
      (actor.is_admin ? "other" : "other"),
  }));
  return NextResponse.json({ ok: true, requests: enriched });
}

// POST - create one or many signature requests against a doc
export async function POST(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { document_id, signer_ids, signer_email, include_owner } = await req.json().catch(() => ({}));
  if (!document_id) return NextResponse.json({ ok: false, error: "document_id required" }, { status: 400 });
  const db = supabaseAdmin as any;

  const rows: any[] = [];
  const ids: string[] = Array.isArray(signer_ids) ? signer_ids : [];

  for (const id of ids) {
    rows.push({
      document_id,
      status: "pending",
      access_token: accessToken(),
      signer_team_member_id: id,
      requested_by: actor.kind === "team" ? actor.id : null,
      requested_by_admin: actor.is_admin,
    });
  }
  if (signer_email) {
    rows.push({
      document_id,
      status: "pending",
      access_token: accessToken(),
      signer_email,
      requested_by: actor.kind === "team" ? actor.id : null,
      requested_by_admin: actor.is_admin,
    });
  }
  if (include_owner && actor.is_admin) {
    rows.push({
      document_id,
      status: "pending",
      access_token: accessToken(),
      signer_email: actor.email,
      requested_by: null,
      requested_by_admin: true,
    });
  }
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "Pick at least one signer" }, { status: 400 });
  }

  const { data, error } = await db.from("team_signature_requests").insert(rows).select("*");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Log to cDocs activity
  await db.from("team_cdocs_activity").insert({
    cdoc_id: document_id,
    actor_member_id: actor.kind === "team" ? actor.id : null,
    actor_is_admin: actor.is_admin,
    actor_name: actor.name,
    action: "sign_requested",
    detail: `${rows.length} signer(s)`,
  });

  // Notify signers via team_notifications
  const notifRows = (data || []).filter((r: any) => r.signer_team_member_id).map((r: any) => ({
    recipient_id: r.signer_team_member_id,
    kind: "csign_request",
    title: "Signature requested",
    body: "A document needs your signature",
    link: `/sign/${r.access_token}`,
    signature_request_id: r.id,
    actor_member_id: actor.kind === "team" ? actor.id : null,
    actor_is_admin: actor.is_admin,
  }));
  if (notifRows.length) await db.from("team_notifications").insert(notifRows);

  return NextResponse.json({ ok: true, requests: data });
}

// PATCH - bulk archive / unarchive
export async function PATCH(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { ids, action } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || !["archive", "unarchive"].includes(action)) {
    return NextResponse.json({ ok: false, error: "Invalid" }, { status: 400 });
  }
  const db = supabaseAdmin as any;
  await db
    .from("team_signature_requests")
    .update({ archived_at: action === "archive" ? new Date().toISOString() : null })
    .in("id", ids);
  return NextResponse.json({ ok: true });
}

// DELETE - soft/hard delete (but never for signed requests)
export async function DELETE(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ids: string[] = body.ids || (body.id ? [body.id] : []);
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "ids required" }, { status: 400 });
  const db = supabaseAdmin as any;
  const { data: signed } = await db.from("team_signature_requests").select("id").in("id", ids).eq("status", "signed");
  const blocked = new Set((signed || []).map((r: any) => r.id));
  const targets = ids.filter((i) => !blocked.has(i));
  if (targets.length) await db.from("team_signature_requests").delete().in("id", targets);
  return NextResponse.json({ ok: true, skipped_signed: Array.from(blocked) });
}
