/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAdminSession } from "@/lib/admin-session";
import { glashQuery } from "@/lib/glashdb/postgres";
import { hashPassword, generateSalt, generateInviteToken } from "@/lib/team-auth";
import { isReservedUsername } from "@/lib/reserved-usernames";
import { logActivity } from "@/lib/activity-log";
import { notifyTeamMember } from "@/lib/notify-team";
import { lagosDate } from "@/lib/timebook";

export const runtime = "nodejs";

// Use the canonical session resolver: accepts the admin_session cookie OR a
// sub-admin's team_session (team-portal login). The old local JSON.parse only
// read admin_session, so team-portal admins got 401s and saw an empty list.
async function verifyAdmin() {
  return getAdminSession();
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
      "id, full_name, email, username, avatar_url, role_title, department, phone, is_active, is_sub_admin, is_team_lead, permissions, invite_token, invite_filled, joined_at, created_at, bank_name, bank_code, account_number, account_name, base_salary, salary_currency, pay_cycle"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const members = data || [];
  const ids = members.map((member: any) => member.id).filter(Boolean);
  const statusRows = ids.length
    ? await glashQuery<{ id: string; availability_status: "online" | "offline" | "break" }>(
        `select
           m.id,
           case
             when e.current_status = 'on_break' then 'break'
             when exists (
               select 1
                 from public.team_device_sessions s
                where s.team_member_id = m.id
                  and s.revoked_at is null
                  and s.expires_at > now()
             ) then 'online'
             else 'offline'
           end as availability_status
         from public.team_members m
         left join public.team_time_entries e
           on e.team_member_id = m.id
          and e.work_date = $2
        where m.id = any($1::uuid[])`,
        [ids, lagosDate()],
      )
    : [];
  const statusById = new Map(statusRows.map((row) => [row.id, row.availability_status]));
  const faceRows = ids.length
    ? await glashQuery<any>(
        `select team_member_id, status, enrolled_at, last_verified_at, enrollment_image_data,
                latest_capture_image_data, latest_capture_at, latest_match_score,
                latest_liveness_score, latest_verification_flag, verification_failures,
                reset_requested_at
           from public.team_face_profiles
          where team_member_id = any($1::uuid[])`,
        [ids],
      )
    : [];
  const faceById = new Map(faceRows.map((row: any) => [row.team_member_id, row]));

  return NextResponse.json({
    ok: true,
    members: members.map((member: any) => ({
      ...member,
      availability_status: statusById.get(member.id) || "offline",
      face_review: faceById.get(member.id) || null,
    })),
  });
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
      body: `You now have admin access with permissions: ${(Array.isArray(permissions) ? permissions : []).join(", ") || "-"}. Check the admin dashboard.`,
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

  if (patch.action === "reset_face_capture") {
    if (admin.role !== "super_admin") {
      return NextResponse.json({ ok: false, error: "Only super admins can reset face captures." }, { status: 403 });
    }
    const memberRow = await glashQuery<{ full_name: string | null; email: string | null }>(
      "select full_name, email from public.team_members where id = $1 limit 1",
      [id],
    );
    if (!memberRow[0]) return NextResponse.json({ ok: false, error: "Team member not found." }, { status: 404 });

    await glashQuery(
      `insert into public.team_face_profiles
        (team_member_id, descriptor, descriptor_version, status, enrollment_attempts,
         verification_failures, metadata, reset_requested_at, reset_requested_by,
         enrollment_image_data, latest_capture_image_data, latest_capture_at,
         latest_match_score, latest_liveness_score, latest_verification_flag)
       values ($1,'[]'::jsonb,'center-gray-32-v1','reset_required',0,0,$2::jsonb,now(),$3,null,null,null,null,null,'reset_required')
       on conflict (team_member_id) do update set
         descriptor = '[]'::jsonb,
         status = 'reset_required',
         verification_failures = 0,
         metadata = coalesce(public.team_face_profiles.metadata, '{}'::jsonb) || excluded.metadata,
         reset_requested_at = now(),
         reset_requested_by = excluded.reset_requested_by,
         enrollment_image_data = null,
         latest_capture_image_data = null,
         latest_capture_at = null,
         latest_match_score = null,
         latest_liveness_score = null,
         latest_verification_flag = 'reset_required',
         latest_verification_event_id = null,
         updated_at = now()`,
      [
        id,
        JSON.stringify({ reset_reason: patch.reason || "Super-admin reset requested" }),
        admin.email || admin.name || "super_admin",
      ],
    );

    await logActivity({
      action: "team_member.reset_face_capture",
      page: "team-members",
      resource_type: "team_member",
      resource_id: id,
      resource_label: memberRow[0].full_name || memberRow[0].email || id,
      metadata: { reason: patch.reason || null },
    });
    return NextResponse.json({ ok: true });
  }

  const allowed = [
    "full_name",
    "role_title",
    "department",
    "phone",
    "is_active",
    "is_sub_admin",
    "is_team_lead",
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

    // Sub-admin promotion (newly granted) - log + notify recipient
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
        body: `You now have admin access with permissions: ${(Array.isArray(updates.permissions) ? updates.permissions : before.permissions || []).join(", ") || "-"}. Check the admin dashboard.`,
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
