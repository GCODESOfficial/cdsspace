/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const { id } = await params;
  const db = supabaseAdmin as any;

  const { password } = await req.json().catch(() => ({}));

  const { data: doc } = await db
    .from("team_protected_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // Visibility check for team members
  if (team) {
    const allowed =
      doc.visibility === "all_team" ||
      (doc.visibility === "department" && doc.allowed_department === team.department) ||
      (doc.visibility === "specific_members" &&
        Array.isArray(doc.allowed_member_ids) &&
        doc.allowed_member_ids.includes(team.id));
    if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // Password gate
  if (doc.password_hash && doc.password_salt) {
    if (!password?.trim()) {
      return NextResponse.json({ ok: false, error: "Password required", password_required: true }, { status: 401 });
    }
    const expected = crypto
      .createHash("sha256")
      .update(String(password).trim() + ":" + doc.password_salt)
      .digest("hex");
    if (expected !== doc.password_hash) {
      return NextResponse.json({ ok: false, error: "Incorrect password", password_required: true }, { status: 401 });
    }
  }

  // Log open
  await db.from("team_protected_document_opens").insert({
    document_id: doc.id,
    team_member_id: team?.id ?? null,
    via: "view",
    user_agent: req.headers.get("user-agent") || null,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
  });

  return NextResponse.json({ ok: true, file_url: doc.file_url });
}
