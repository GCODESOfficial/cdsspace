/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { hashPassword, generateSalt, generateInviteToken } from "@/lib/team-auth";
import { isReservedUsername } from "@/lib/reserved-usernames";
import { logActivity } from "@/lib/activity-log";
import { notifyTeamMember } from "@/lib/notify-team";

export const runtime = "nodejs";

async function verifyAdmin() {
  const store = await cookies();
  const raw = store.get("admin_session")?.value;
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    return session.role === "super_admin" || session.role === "sub_admin" ? session : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("team_members")
    .select(
      "id, full_name, email, username, avatar_url, role_title, department, phone, is_active, is_sub_admin, permissions, invite_token, invite_filled, joined_at, created_at, bank_name, bank_code, account_number, account_name, base_salary, salary_currency, pay_cycle"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, members: data || [] });
}

export async function POST(req: Request) {
  const admin = await verifyAdmin();
  if (!admin || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    full_name,
    email,
    username,
    password,
    role_title,
    department,
    phone,
    is_sub_admin,
    permissions,
    send_invite,
  } = body;

  if (!full_name?.trim() || !email?.trim() || !username?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Full name, email and username are required" },
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
      { ok: false, error: `"${cleanUsername}" is a reserved name. Pick a different username.` },
      { status: 400 }
    );
  }

  const salt = generateSalt();
  const pwd = password && String(password).length >= 8 ? password : generateInviteToken().slice(0, 12);
  const password_hash = hashPassword(pwd, salt);
  const invite_token = send_invite ? generateInviteToken() : null;

  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("team_members")
    .insert({
      full_name: full_name.trim(),
      email: email.trim().toLowerCase(),
      username: cleanUsername,
      password_hash,
      password_salt: salt,
      role_title: role_title || null,
      department: department || null,
      phone: phone || null,
      is_sub_admin: !!is_sub_admin,
      permissions: Array.isArray(permissions) ? permissions : [],
      invite_token,
      // Store plaintext temporarily so the invite link can pre-fill the
      // login form. Cleared by DB trigger the moment invite_token → null.
      invite_temp_password: send_invite ? pwd : null,
      invite_filled: !send_invite,
    })
    .select("id, invite_token")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await logActivity({
    action: is_sub_admin ? "team_member.create_sub_admin" : "team_member.create",
    page: "team-members",
    resource_type: "team_member",
    resource_id: data.id,
    resource_label: full_name.trim(),
    metadata: { email: email.trim().toLowerCase(), role_title, department, sent_invite: !!send_invite },
  });

  // Sub-admin promotion creates a notification for the new member so they
  // know the scope granted and where to go next.
  if (is_sub_admin) {
    await notifyTeamMember({
      recipient_id: data.id,
      kind: "sub_admin_granted",
      title: "You've been made a sub-admin",
      body: `You now have admin access with permissions: ${(Array.isArray(permissions) ? permissions : []).join(", ") || "—"}. Check the admin dashboard.`,
      link: "/admin",
      actor_is_admin: true,
    });
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    invite_token: data.invite_token,
    // Always echo back the configured/generated password so the admin can
    // share it directly alongside the invite link.
    configured_password: pwd,
    generated_password: password ? null : pwd,
  });
}

export async function PATCH(req: Request) {
  const admin = await verifyAdmin();
  if (!admin || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id, ...patch } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const allowed = [
    "full_name",
    "role_title",
    "department",
    "phone",
    "is_active",
    "is_sub_admin",
    "permissions",
  ];
  const updates: Record<string, any> = {};
  for (const k of allowed) if (k in patch) updates[k] = patch[k];

  const db = supabaseAdmin as any;

  // Fetch the pre-update row so we can detect meaningful transitions
  // (suspend ↔ reactivate, sub-admin promotion) for logging + notify.
  const { data: before } = await db
    .from("team_members")
    .select("id, full_name, email, is_active, is_sub_admin, permissions")
    .eq("id", id)
    .maybeSingle();

  const { error } = await db.from("team_members").update(updates).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (before) {
    const label = before.full_name || before.email;

    // Suspend / unsuspend
    if ("is_active" in updates && updates.is_active !== before.is_active) {
      await logActivity({
        action: updates.is_active ? "team_member.unsuspend" : "team_member.suspend",
        page: "team-members",
        resource_type: "team_member",
        resource_id: id,
        resource_label: label,
      });
    }

    // Sub-admin promotion (newly granted) — log + notify recipient
    const promoted = !before.is_sub_admin && updates.is_sub_admin === true;
    const demoted = before.is_sub_admin && updates.is_sub_admin === false;
    if (promoted) {
      await logActivity({
        action: "team_member.promote",
        page: "team-members",
        resource_type: "team_member",
        resource_id: id,
        resource_label: label,
        metadata: { permissions: updates.permissions ?? before.permissions ?? [] },
      });
      await notifyTeamMember({
        recipient_id: id,
        kind: "sub_admin_granted",
        title: "You've been made a sub-admin",
        body: `You now have admin access with permissions: ${(Array.isArray(updates.permissions) ? updates.permissions : before.permissions || []).join(", ") || "—"}. Check the admin dashboard.`,
        link: "/admin",
        actor_is_admin: true,
      });
    } else if (demoted) {
      await logActivity({
        action: "team_member.demote",
        page: "team-members",
        resource_type: "team_member",
        resource_id: id,
        resource_label: label,
      });
    } else if ("permissions" in updates || ("is_sub_admin" in updates && updates.is_sub_admin)) {
      await logActivity({
        action: "team_member.update_permissions",
        page: "team-members",
        resource_type: "team_member",
        resource_id: id,
        resource_label: label,
        metadata: { permissions: updates.permissions ?? [] },
      });
    }

    // Any other profile edit
    const profileKeys = ["full_name", "role_title", "department", "phone"];
    const editedProfile = profileKeys.some((k) => k in updates);
    if (editedProfile && !("is_active" in updates) && !promoted && !demoted) {
      await logActivity({
        action: "team_member.update",
        page: "team-members",
        resource_type: "team_member",
        resource_id: id,
        resource_label: label,
        metadata: Object.fromEntries(profileKeys.filter((k) => k in updates).map((k) => [k, updates[k]])),
      });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const admin = await verifyAdmin();
  if (!admin || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const db = supabaseAdmin as any;
  const { data: before } = await db
    .from("team_members")
    .select("full_name, email")
    .eq("id", id)
    .maybeSingle();

  const { error } = await db.from("team_members").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await logActivity({
    action: "team_member.delete",
    page: "team-members",
    resource_type: "team_member",
    resource_id: id,
    resource_label: before?.full_name || before?.email || id,
  });

  return NextResponse.json({ ok: true });
}
