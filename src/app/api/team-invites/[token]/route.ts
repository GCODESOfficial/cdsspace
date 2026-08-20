/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  hashPassword,
  generateSalt,
  sessionCookieOptions,
  TEAM_SESSION_COOKIE,
} from "@/lib/team-auth";
import { createTeamSession } from "@/lib/team-login-security";
import { isReservedUsername } from "@/lib/reserved-usernames";

export const runtime = "nodejs";

// GET - fetch invite metadata so the form can pre-fill suggested hints.
// Handles two token shapes:
//   1. team_invites (blank self-serve invite)
//   2. team_members.invite_token (admin pre-created a pending row)
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Invalid invite" }, { status: 400 });
  }
  const db = supabaseAdmin as any;

  // Fetch all departments to populate the dropdown
  const { data: allDepartments } = await db
    .from("departments")
    .select("id, name")
    .order("name");

  // 1) Blank self-serve invite
  const { data, error } = await db
    .from("team_invites")
    .select(
      "id, token, suggested_role_title, suggested_department_id, is_sub_admin, permissions, redeemed_at, expires_at, created_at"
    )
    .eq("token", token)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (data) {
    if (data.redeemed_at) return NextResponse.json({ ok: false, error: "Invite already used" }, { status: 410 });
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ ok: false, error: "Invite expired" }, { status: 410 });
    }
    let suggested_department: { id: string; name: string } | null = null;
    if (data.suggested_department_id) {
      suggested_department = (allDepartments || []).find((d: any) => d.id === data.suggested_department_id) || null;
    }
    return NextResponse.json({
      ok: true,
      departments: allDepartments || [],
      invite: {
        token: data.token,
        kind: "blank" as const,
        suggested_full_name: null,
        suggested_email: null,
        suggested_username: null,
        suggested_role_title: data.suggested_role_title,
        suggested_phone: null,
        suggested_department,
        is_sub_admin: data.is_sub_admin,
      },
    });
  }

  // 2) Existing pre-created team_members row
  const { data: member, error: memberErr } = await db
    .from("team_members")
    .select(
      "id, full_name, email, username, role_title, phone, department, department_id, is_sub_admin, invite_filled"
    )
    .eq("invite_token", token)
    .maybeSingle();
  if (memberErr) return NextResponse.json({ ok: false, error: memberErr.message }, { status: 500 });
  if (!member) return NextResponse.json({ ok: false, error: "Invite not found" }, { status: 404 });
  if (member.invite_filled) {
    return NextResponse.json({ ok: false, error: "Invite already used" }, { status: 410 });
  }

  let suggested_department: { id: string; name: string } | null = null;
  if (member.department_id) {
    suggested_department = (allDepartments || []).find((d: any) => d.id === member.department_id) || null;
  } else if (member.department) {
    suggested_department = { id: "", name: member.department };
  }

  return NextResponse.json({
    ok: true,
    departments: allDepartments || [],
    invite: {
      token,
      kind: "member" as const,
      suggested_full_name: member.full_name,
      suggested_email: member.email,
      suggested_username: member.username,
      suggested_role_title: member.role_title,
      suggested_phone: member.phone,
      suggested_department,
      is_sub_admin: member.is_sub_admin,
    },
  });
}

// POST - redeem: create a team_members row from the invitee-supplied fields
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Invalid invite" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { full_name, email, username, password, role_title, department_name, phone, bio } = body;

  if (!full_name?.trim() || !email?.trim() || !username?.trim() || !password) {
    return NextResponse.json(
      { ok: false, error: "Full name, email, username and password are required" },
      { status: 400 }
    );
  }
  if (String(password).length < 8) {
    return NextResponse.json(
      { ok: false, error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const cleanUsername = String(username).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,30}$/.test(cleanUsername)) {
    return NextResponse.json(
      { ok: false, error: "Username must be 2–31 chars: lowercase letters, digits, . _ -" },
      { status: 400 }
    );
  }
  if (isReservedUsername(cleanUsername)) {
    return NextResponse.json(
      { ok: false, error: `"${cleanUsername}" is reserved. Pick a different username.` },
      { status: 400 }
    );
  }

  const db = supabaseAdmin as any;

  // Determine token kind: team_invites (blank) vs team_members.invite_token (pre-created)
  const { data: invite } = await db
    .from("team_invites")
    .select("id, suggested_role_title, suggested_department_id, is_sub_admin, permissions, redeemed_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  let pendingMember: any = null;
  if (!invite) {
    const { data: m } = await db
      .from("team_members")
      .select("id, is_sub_admin, permissions, department_id, invite_filled")
      .eq("invite_token", token)
      .maybeSingle();
    if (!m) return NextResponse.json({ ok: false, error: "Invite not found" }, { status: 404 });
    if (m.invite_filled) return NextResponse.json({ ok: false, error: "Invite already used" }, { status: 410 });
    pendingMember = m;
  } else {
    if (invite.redeemed_at) return NextResponse.json({ ok: false, error: "Invite already used" }, { status: 410 });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ ok: false, error: "Invite expired" }, { status: 410 });
    }
  }

  // Resolve department - either the invitee typed one or the admin pre-filled one
  let department_id: string | null = invite
    ? invite.suggested_department_id || null
    : pendingMember.department_id || null;
  const rawDeptName = (department_name || "").trim();
  if (rawDeptName) {
    const { data: existingDept } = await db
      .from("departments")
      .select("id")
      .ilike("name", rawDeptName)
      .maybeSingle();
    if (existingDept) {
      department_id = existingDept.id;
    } else {
      const { data: createdDept, error: deptErr } = await db
        .from("departments")
        .insert({ name: rawDeptName })
        .select("id")
        .single();
      if (deptErr) return NextResponse.json({ ok: false, error: deptErr.message }, { status: 500 });
      department_id = createdDept.id;
    }
  }

  // Resolve the name of the resolved department (for the legacy TEXT column)
  let department_text: string | null = rawDeptName || null;
  if (!department_text && department_id) {
    const { data: d } = await db.from("departments").select("name").eq("id", department_id).maybeSingle();
    department_text = d?.name || null;
  }

  const salt = generateSalt();
  const password_hash = hashPassword(password, salt);

  let memberId: string;
  let memberName: string;
  let memberUsername: string;

  if (pendingMember) {
    // Finalize the existing pre-created row
    const { data: updated, error: updateErr } = await db
      .from("team_members")
      .update({
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        username: cleanUsername,
        password_hash,
        password_salt: salt,
        role_title: role_title || null,
        department: department_text,
        department_id,
        phone: phone || null,
        bio: bio || null,
        invite_token: null,
        invite_filled: true,
        is_active: true,
      })
      .eq("id", pendingMember.id)
      .select("id, full_name, email, username")
      .single();

    if (updateErr) {
      if (String(updateErr.message).toLowerCase().includes("duplicate")) {
        return NextResponse.json(
          { ok: false, error: "That email or username is already taken." },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }
    memberId = updated.id;
    memberName = updated.full_name;
    memberUsername = updated.username;
  } else {
    // Blank invite - create a fresh row
    const { data: member, error: memberErr } = await db
      .from("team_members")
      .insert({
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        username: cleanUsername,
        password_hash,
        password_salt: salt,
        role_title: role_title || invite.suggested_role_title || null,
        department: department_text,
        department_id,
        phone: phone || null,
        bio: bio || null,
        is_sub_admin: !!invite.is_sub_admin,
        permissions: Array.isArray(invite.permissions) ? invite.permissions : [],
        invite_token: null,
        invite_filled: true,
      })
      .select("id, full_name, email, username")
      .single();

    if (memberErr) {
      if (String(memberErr.message).toLowerCase().includes("duplicate")) {
        return NextResponse.json(
          { ok: false, error: "That email or username is already taken." },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: false, error: memberErr.message }, { status: 500 });
    }
    memberId = member.id;
    memberName = member.full_name;
    memberUsername = member.username;

    await db
      .from("team_invites")
      .update({ redeemed_at: new Date().toISOString(), redeemed_member_id: memberId })
      .eq("token", token);
  }

  const { sessionToken } = await createTeamSession(memberId, req, { source: "team_invite" });

  const response = NextResponse.json({
    ok: true,
    member: { id: memberId, full_name: memberName, username: memberUsername },
  });
  response.cookies.set(TEAM_SESSION_COOKIE, sessionToken, sessionCookieOptions());
  return response;
}
