/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { BLOCKED_EMAIL_MESSAGE, isBlockedEmail } from "@/lib/security/email-blocklist";

export const runtime = "nodejs";

/**
 * Exchange a raw team invite token for the member's login credentials
 * exactly once. Called by the team sign-in page when the URL carries
 * ?invite=TOKEN so it can pre-fill the username and password fields.
 *
 * After this endpoint returns credentials, the invite_token is cleared
 * and a DB trigger (see supabase-team-invite-credentials.sql) also
 * blanks invite_temp_password - so a replay cannot retrieve them again.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";

  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid invite token" }, { status: 400 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const db = supabaseAdmin as any;

  const { data: member } = await db
    .from("team_members")
    .select("id, username, email, invite_temp_password, invite_filled, is_active")
    .eq("invite_token", token)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Invite not found or already used" }, { status: 404 });
  }
  if (!member.is_active) {
    return NextResponse.json({ error: "Account is inactive" }, { status: 403 });
  }
  if (isBlockedEmail(member.email)) {
    return NextResponse.json({ error: BLOCKED_EMAIL_MESSAGE }, { status: 403 });
  }
  if (!member.invite_temp_password) {
    return NextResponse.json(
      { error: "No credentials stored for this invite. Ask the admin to generate a new link." },
      { status: 410 }
    );
  }

  const tempPassword = String(member.invite_temp_password);

  // Clear the invite_token - the DB trigger will also blank invite_temp_password
  // and we flip invite_filled so the member is considered active.
  const { error: updateError } = await db
    .from("team_members")
    .update({ invite_token: null, invite_filled: true })
    .eq("id", member.id)
    .eq("invite_token", token); // guards against a race

  if (updateError) {
    return NextResponse.json({ error: "Failed to redeem invite" }, { status: 500 });
  }

  return NextResponse.json({
    username: member.username,
    email: member.email,
    password: tempPassword,
  });
}
