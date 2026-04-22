/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

export async function GET() {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const db = supabaseAdmin as any;

  const admin = await getAdminSession();
  if (admin) {
    const { data } = await db
      .from("team_signature_requests")
      .select("*")
      .order("created_at", { ascending: false });
    return NextResponse.json({ ok: true, actor: "admin", requests: data || [] });
  }

  const team = await getTeamSession();
  if (!team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // Both mine-to-sign and mine-created
  const { data } = await db
    .from("team_signature_requests")
    .select("*")
    .or(`signer_team_member_id.eq.${team.id},requested_by.eq.${team.id}`)
    .order("created_at", { ascending: false });

  return NextResponse.json({ ok: true, actor: "team", requests: data || [] });
}

export async function POST(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });

  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const {
    document_id,
    signer_team_member_id,
    signer_email,
    signer_name,
    title,
    message,
    fields,
    expires_in_days,
  } = await req.json().catch(() => ({}));

  if (!signer_team_member_id && !signer_email?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Specify either an internal signer or an external email" },
      { status: 400 }
    );
  }

  const access_token = crypto.randomBytes(24).toString("hex");
  const db = supabaseAdmin as any;

  const expires_at = expires_in_days
    ? new Date(Date.now() + Number(expires_in_days) * 86_400_000).toISOString()
    : null;

  const { data, error } = await db
    .from("team_signature_requests")
    .insert({
      document_id: document_id || null,
      requested_by: team?.id || null,
      requested_by_admin: !!admin,
      signer_team_member_id: signer_team_member_id || null,
      signer_email: signer_email?.trim() || null,
      signer_name: signer_name?.trim() || null,
      title: title?.trim() || null,
      message: message?.trim() || null,
      expires_at,
      access_token,
      status: "pending",
    })
    .select("id, access_token")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Seed fields. Default to a single signature field if caller didn't specify.
  const fieldRows = Array.isArray(fields) && fields.length > 0
    ? fields
    : [{ kind: "signature", label: "Signature", required: true }];
  const toInsert = fieldRows.map((f: any, i: number) => ({
    request_id: data.id,
    kind: f.kind || "signature",
    label: f.label || null,
    position: typeof f.position === "number" ? f.position : i,
    required: f.required !== false,
  }));
  await db.from("team_signature_fields").insert(toInsert);

  await db
    .from("team_signature_audit_log")
    .insert({
      request_id: data.id,
      event: "created",
      actor_member_id: team?.id || null,
      actor_is_admin: !!admin,
    });

  // Notify internal signer
  if (signer_team_member_id) {
    await db.from("team_notifications").insert({
      recipient_id: signer_team_member_id,
      kind: "csign_request",
      title: "You have a signature request",
      body: signer_name ? `From ${signer_name}` : null,
      link: `/team/csign`,
      actor_member_id: team?.id || null,
      actor_is_admin: !!admin,
      signature_request_id: data.id,
    });
  }

  return NextResponse.json({ ok: true, id: data.id, access_token: data.access_token });
}
