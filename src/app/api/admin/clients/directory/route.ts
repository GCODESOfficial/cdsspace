import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail, verifyEmailReady } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";
import { logActivity } from "@/lib/activity-log";
import {
  createClientAccountInvite,
  findClientDuplicates,
  getUnifiedClientDirectory,
  mergeClientIntoProfile,
} from "@/lib/client-directory-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullable(value: unknown, max = 1000) {
  return text(value, max) || null;
}

function selectedIndustries(body: Record<string, unknown>) {
  const values = Array.isArray(body.industries) ? body.industries : [body.industry];
  const unique = new Map<string, string>();
  for (const value of values) {
    const industry = text(value, 140);
    if (industry && !unique.has(industry.toLowerCase())) unique.set(industry.toLowerCase(), industry);
  }
  return [...unique.values()].slice(0, 12);
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://cdsspace.pro").replace(/\/$/, "");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] || character);
}

function clientPayload(body: Record<string, unknown>) {
  const birthday = nullable(body.birthday, 10);
  const industries = selectedIndustries(body);
  return {
    name: text(body.name, 180),
    brand_name: nullable(body.brand_name, 180),
    email: nullable(body.email, 320)?.toLowerCase() || null,
    phone: nullable(body.phone, 60),
    whatsapp: nullable(body.whatsapp, 60),
    industry: industries[0] || null,
    industries,
    contact_person: nullable(body.contact_person, 180),
    address: nullable(body.address, 500),
    notes: nullable(body.notes, 4000),
    status: ["active", "lead", "inactive", "archived"].includes(text(body.status, 20)) ? text(body.status, 20) : "active",
    birthday,
    birthday_reminder_enabled: Boolean(birthday && body.birthday_reminder_enabled !== false),
    birthday_reminder_days: Math.min(90, Math.max(1, Number(body.birthday_reminder_days) || 30)),
    preferred_contact_method: ["email", "whatsapp", "phone"].includes(text(body.preferred_contact_method, 20))
      ? text(body.preferred_contact_method, 20)
      : null,
  };
}

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "clients.view");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getUnifiedClientDirectory());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load clients." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "clients.create");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const payload = clientPayload(body);
  if (!payload.name) return NextResponse.json({ error: "Client name is required." }, { status: 400 });
  const platformUserId = text(body.platform_user_id, 80) || null;
  try {
    const duplicates = await findClientDuplicates({ ...payload, intendedPlatformUserId: platformUserId });
    if (duplicates.manual.length || duplicates.profiles.length) {
      return NextResponse.json({
        error: "A similar client already exists. Review or merge the existing record instead of creating another one.",
        duplicates,
      }, { status: 409 });
    }
    const sb = getSupabaseAdmin() as any;
    const { data, error } = await sb.from("clients").insert({
      ...payload,
      platform_user_id: platformUserId,
      account_linked_at: platformUserId ? new Date().toISOString() : null,
      account_linked_by: platformUserId ? session.email : null,
    }).select("id").single();
    if (error) throw error;
    await logActivity({
      action: "client.create",
      page: "clients/list",
      resource_type: "client",
      resource_id: data.id,
      resource_label: payload.brand_name || payload.name,
      metadata: { platform_user_id: platformUserId, duplicate_check: "passed" },
    });
    return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the client.";
    return NextResponse.json({ error: message }, { status: /duplicate|unique/i.test(message) ? 409 : 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body.action, 30) || "update";
  const permission = action === "invite" ? "clients.edit" : action === "merge" ? "clients.edit" : "clients.edit";
  const { session, denied } = await requireAdmin(req, permission);
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (action === "merge") {
      const manualClientId = text(body.manual_client_id, 80);
      const platformUserId = text(body.platform_user_id, 80);
      if (!manualClientId || !platformUserId) {
        return NextResponse.json({ error: "Choose both the manual client and platform account." }, { status: 400 });
      }
      await mergeClientIntoProfile({ manualClientId, platformUserId, actor: session.email });
      await logActivity({
        action: "client.merge_account",
        page: "clients/list",
        resource_type: "client",
        resource_id: manualClientId,
        resource_label: manualClientId,
        metadata: { platform_user_id: platformUserId },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "invite") {
      const manualClientId = text(body.manual_client_id, 80);
      if (!manualClientId) return NextResponse.json({ error: "Client ID is required." }, { status: 400 });
      const emailReadinessError = await verifyEmailReady();
      if (emailReadinessError) {
        console.error("[client-invite] email transport is unavailable:", emailReadinessError);
        return NextResponse.json({ error: "Client invitations are temporarily unavailable because email delivery is offline. Please try again shortly." }, { status: 503 });
      }
      const result = await createClientAccountInvite(manualClientId, session.email);
      const url = new URL(`${siteUrl()}/signup`);
      url.searchParams.set("email", result.client.email || "");
      url.searchParams.set("client_invite", result.rawToken);
      const inviteUrl = url.toString();
      try {
        const clientName = result.client.brand_name || result.client.name;
        const bodyHtml = `
          <p style="margin:0 0 14px 0;">Hello ${escapeHtml(clientName)},</p>
          <p style="margin:0 0 14px 0;">CDS Space has prepared a client account for your finished project files and deliverables. Create your account using the secure button below to access everything in one place.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
            <tr><td style="border-radius:10px;background:#0A4FE8;">
              <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:13px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">Create your account</a>
            </td></tr>
          </table>
          <p style="margin:0;color:#667085;font-size:13px;">This secure link expires in 14 days. If the button does not work, copy and paste this link into your browser:<br/><a href="${escapeHtml(inviteUrl)}" style="color:#0A4FE8;word-break:break-all;">${escapeHtml(inviteUrl)}</a></p>`;
        await sendEmail({
          to: result.client.email || "",
          subject: "Your CDS Space client account invitation",
          fromName: "CDS Space",
          text: `Hello ${clientName},\n\nCDS Space has prepared a client account for your project files and deliverables. Create your account using this secure link:\n${inviteUrl}\n\nThe link expires in 14 days.`,
          html: brandedEmailHtml(bodyHtml, {
            eyebrow: "Client invitation",
            preheader: "Create your CDS Space client account to access your finished project files and deliverables.",
          }),
        });
      } catch (error) {
        console.error("[client-invite] delivery failed:", error);
        await logActivity({
          action: "client.invite_failed",
          page: "clients/list",
          resource_type: "client",
          resource_id: manualClientId,
          resource_label: result.client.brand_name || result.client.name,
          metadata: { emailed: false, invite_id: result.invite.id },
        }).catch(() => undefined);
        return NextResponse.json({
          ok: false,
          error: "The invitation email could not be delivered. The secure invitation link was copied so it can be shared manually.",
          invite_url: inviteUrl,
          expires_at: result.invite.expires_at,
        }, { status: 502 });
      }
      await logActivity({
        action: "client.invite",
        page: "clients/list",
        resource_type: "client",
        resource_id: manualClientId,
        resource_label: result.client.brand_name || result.client.name,
        metadata: { emailed: true, invite_id: result.invite.id },
      });
      return NextResponse.json({ ok: true, emailed: true, invite_url: inviteUrl, expires_at: result.invite.expires_at });
    }

    const manualClientId = text(body.manual_client_id, 80);
    if (!manualClientId) return NextResponse.json({ error: "Manual client ID is required." }, { status: 400 });
    const payload = clientPayload(body);
    if (!payload.name) return NextResponse.json({ error: "Client name is required." }, { status: 400 });
    const duplicates = await findClientDuplicates({ ...payload, excludeManualId: manualClientId });
    if (duplicates.manual.length) {
      return NextResponse.json({ error: "Another manual client matches these details.", duplicates }, { status: 409 });
    }
    const sb = getSupabaseAdmin() as any;
    const { error } = await sb.from("clients").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", manualClientId);
    if (error) throw error;
    await logActivity({
      action: "client.update",
      page: "clients/list",
      resource_type: "client",
      resource_id: manualClientId,
      resource_label: payload.brand_name || payload.name,
      metadata: { platform_matches: duplicates.profiles.map((profile) => profile.id) },
    });
    return NextResponse.json({ ok: true, duplicate_profiles: duplicates.profiles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the client.";
    return NextResponse.json({ error: message }, { status: /already|duplicate|linked|match/i.test(message) ? 409 : 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "clients.delete");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const ids = Array.isArray(body.ids) ? body.ids.map((id) => text(id, 80)).filter(Boolean).slice(0, 100) : [];
  if (!ids.length) return NextResponse.json({ error: "Choose at least one manual client." }, { status: 400 });
  const sb = getSupabaseAdmin() as any;
  const { error } = await sb.from("clients").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity({
    action: "client.delete",
    page: "clients/list",
    resource_type: "client",
    resource_label: `${ids.length} client record${ids.length === 1 ? "" : "s"}`,
    metadata: { ids },
  });
  return NextResponse.json({ ok: true });
}
