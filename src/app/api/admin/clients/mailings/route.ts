/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { findClientDuplicates, getUnifiedClientDirectory } from "@/lib/client-directory-server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { chatComplete } from "@/lib/ai/openai";
import { logActivity } from "@/lib/activity-log";
import { ADMIN_FEATURE_PERMISSION_KEYS, notifyAdminFeatureEvent } from "@/lib/admin-feature-notifications";
import { verifyNewAccountEmail } from "@/lib/email-verification-policy";
import {
  CLIENT_MAILING_IMAGE_BUCKET,
  ClientMailingError,
  cleanMailingSelection,
  deliverClientMailing,
  mailingText,
  quickMailingEmail,
  resolveClientMailingRecipients,
  signedClientMailingPreview,
  type ClientEmailCampaign,
} from "@/lib/client-mailing-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const text = mailingText;
const quickEmail = quickMailingEmail;
const cleanSelection = cleanMailingSelection;
type Campaign = ClientEmailCampaign;

type CampaignSummary = {
  id: string;
  subject: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_by: string;
  scheduled_for: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function scheduleDate(value: unknown) {
  const raw = text(value, 50);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "clients.mailings.view");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const requestedId = text(req.nextUrl.searchParams.get("campaign_id"), 80);
    if (requestedId && !isUuid(requestedId)) {
      return NextResponse.json({ error: "Invalid mailing ID." }, { status: 400 });
    }
    const [{ clients }, campaigns, scheduledCampaigns, draft, requestedCampaign] = await Promise.all([
      getUnifiedClientDirectory(),
      glashQuery<CampaignSummary>(
        `select id, subject, status, recipient_count, sent_count, failed_count, created_by,
                scheduled_for, sent_at, created_at, updated_at
           from public.client_email_campaigns
          where status in ('sent', 'partial_failed', 'failed')
          order by updated_at desc
          limit 30`,
      ),
      glashQuery<CampaignSummary>(
        `select id, subject, status, recipient_count, sent_count, failed_count, created_by,
                scheduled_for, sent_at, created_at, updated_at
           from public.client_email_campaigns
          where status = 'scheduled'
          order by scheduled_for asc, updated_at desc
          limit 100`,
      ),
      glashMaybeOne<Campaign>(
        `select id, subject, body_text, recipient_selection, cover_storage_path, cover_file_name,
                cover_mime_type, status, created_by, scheduled_for
           from public.client_email_campaigns
          where status = 'draft' and created_by = $1
          order by updated_at desc
          limit 1`,
        [session.email],
      ),
      requestedId
        ? glashMaybeOne<Campaign>(
          `select id, subject, body_text, recipient_selection, cover_storage_path, cover_file_name,
                  cover_mime_type, status, created_by, scheduled_for
             from public.client_email_campaigns
            where id = $1::uuid and status in ('draft', 'scheduled')
            limit 1`,
          [requestedId],
        )
        : Promise.resolve(null),
    ]);
    const availableClients = clients
      .filter((client) => client.status !== "archived" && quickEmail(client.email))
      .map((client) => ({
        id: client.id,
        name: client.name,
        brand_name: client.brand_name,
        email: quickEmail(client.email),
        status: client.status,
        source: client.source,
        has_platform_account: client.has_platform_account,
        platform_user_id: client.platform_user_id,
      }));
    const [draftPreview, requestedPreview] = await Promise.all([
      draft ? signedClientMailingPreview(draft.cover_storage_path) : null,
      requestedCampaign ? signedClientMailingPreview(requestedCampaign.cover_storage_path) : null,
    ]);
    return NextResponse.json({
      ok: true,
      clients: availableClients,
      campaigns,
      scheduled_campaigns: scheduledCampaigns,
      draft: draft ? { ...draft, preview_url: draftPreview } : null,
      campaign: requestedCampaign ? { ...requestedCampaign, preview_url: requestedPreview } : null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load client mailings." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body.action, 30);
  const permission = action === "send" || action === "schedule" ? "clients.mailings.send" : "clients.mailings.create";
  const { session, denied } = await requireAdmin(req, permission);
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (action === "add_client") {
      const name = text(body.name, 180);
      const brandName = text(body.brand_name, 180) || null;
      if (!name) return NextResponse.json({ error: "Client name is required." }, { status: 400 });
      const emailCheck = await verifyNewAccountEmail(body.email);
      if (!emailCheck.ok) return NextResponse.json({ error: emailCheck.error }, { status: 400 });
      const duplicates = await findClientDuplicates({ name, brand_name: brandName, email: emailCheck.email });
      if (duplicates.manual.length || duplicates.profiles.length) {
        return NextResponse.json({
          error: "A client or CDS Space account already matches these details. Select the existing recipient instead.",
          duplicates,
        }, { status: 409 });
      }
      const client = await glashMaybeOne<{ id: string }>(
        `insert into public.clients
          (name, brand_name, email, contact_person, status, preferred_contact_method, notes)
         values ($1,$2,$3,$1,'lead','email',$4)
         returning id`,
        [name, brandName, emailCheck.email, "Added from Client mailings before a CDS Space account was created."],
      );
      if (!client) return NextResponse.json({ error: "Client could not be added." }, { status: 500 });
      await logActivity({
        action: "client.create",
        page: "clients/mailings",
        resource_type: "client",
        resource_id: client.id,
        resource_label: brandName || name,
        metadata: { source: "client_mailings", has_platform_account: false },
      }).catch(() => undefined);
      return NextResponse.json({ ok: true, id: client.id }, { status: 201 });
    }

    if (action === "rewrite") {
      const current = text(body.body_text, 20_000);
      if (!current) return NextResponse.json({ error: "Write the email before using rewrite." }, { status: 400 });
      const mode = body.mode === "improve" ? "improve" : "rewrite";
      const result = await chatComplete([
        {
          role: "system",
          content: `You are the professional email editor for CDS Space. ${mode === "improve" ? "Improve clarity, structure, credibility and response value." : "Rewrite the draft with fresh professional wording while preserving its intent."} Preserve every supplied fact, name, price, date, link and commitment. Do not invent metrics or claims. Do not add emojis, hashtags, markdown headings, a subject line, or commentary. Return only the plain-text email body.`,
        },
        { role: "user", content: `Subject context: ${text(body.subject, 200) || "Client update"}\n\nDraft:\n${current}` },
      ], { temperature: mode === "improve" ? 0.35 : 0.65, max_tokens: 1600, user: session.email });
      return NextResponse.json({ ok: true, result: result.text.trim() });
    }

    if (action === "save_draft") {
      const campaignId = text(body.campaign_id, 80);
      if (campaignId && !isUuid(campaignId)) return NextResponse.json({ error: "Invalid mailing ID." }, { status: 400 });
      const subject = text(body.subject, 200);
      const bodyText = text(body.body_text, 20_000);
      const selection = cleanSelection(body.recipient_selection);
      const coverPath = text(body.cover_storage_path, 500);
      const safeCoverPath = coverPath.startsWith("sales-mailings/") ? coverPath : null;
      const scheduled = scheduleDate(body.scheduled_for);
      if (scheduled === undefined) return NextResponse.json({ error: "Choose a valid schedule date and time." }, { status: 400 });
      const params = [
        subject,
        bodyText,
        JSON.stringify(selection),
        safeCoverPath,
        text(body.cover_file_name, 180) || null,
        text(body.cover_mime_type, 100) || null,
        session.email,
        scheduled?.toISOString() || null,
      ];
      let campaign: Campaign | null;
      if (campaignId) {
        campaign = await glashMaybeOne<Campaign>(
          `update public.client_email_campaigns
              set subject = $1, body_text = $2, recipient_selection = $3::jsonb,
                  cover_storage_path = $4, cover_file_name = $5, cover_mime_type = $6,
                  scheduled_for = case when status = 'scheduled' then coalesce($8::timestamptz, scheduled_for) else $8::timestamptz end,
                  updated_at = now()
            where id = $9::uuid
              and ((created_by = $7 and status = 'draft') or status = 'scheduled')
            returning *`,
          [...params, campaignId],
        );
        if (!campaign) return NextResponse.json({ error: "This mailing is no longer editable." }, { status: 409 });
      } else {
        campaign = await glashMaybeOne<Campaign>(
          `insert into public.client_email_campaigns
            (subject, body_text, recipient_selection, cover_storage_path, cover_file_name,
             cover_mime_type, created_by, scheduled_for)
           values ($1,$2,$3::jsonb,$4,$5,$6,$7,$8::timestamptz)
           returning *`,
          params,
        );
      }
      return NextResponse.json({ ok: true, campaign });
    }

    if (action === "schedule") {
      const campaignId = text(body.campaign_id, 80);
      if (!isUuid(campaignId)) return NextResponse.json({ error: "Save the mailing before scheduling it." }, { status: 400 });
      const scheduled = scheduleDate(body.scheduled_for);
      if (!scheduled) return NextResponse.json({ error: "Choose a valid date and time." }, { status: 400 });
      if (scheduled.getTime() < Date.now() + 60_000) {
        return NextResponse.json({ error: "Choose a time at least one minute in the future." }, { status: 400 });
      }
      const campaign = await glashMaybeOne<Campaign>(
        `select * from public.client_email_campaigns
          where id = $1::uuid
            and ((status = 'draft' and created_by = $2) or status = 'scheduled')
          limit 1`,
        [campaignId, session.email],
      );
      if (!campaign) return NextResponse.json({ error: "This mailing is no longer available to schedule." }, { status: 409 });
      const recipients = await resolveClientMailingRecipients(campaign);
      const updated = await glashMaybeOne<Campaign>(
        `update public.client_email_campaigns
            set status='scheduled', scheduled_for=$2, scheduled_by=$3,
                recipient_count=$4, sent_count=0, failed_count=0,
                sent_at=null, claimed_at=null, last_error=null, updated_at=now()
          where id=$1::uuid
            and ((status='draft' and created_by=$3) or status='scheduled')
          returning *`,
        [campaign.id, scheduled.toISOString(), session.email, recipients.length],
      );
      if (!updated) return NextResponse.json({ error: "This mailing is already being processed." }, { status: 409 });
      await logActivity({
        action: campaign.status === "scheduled" ? "client_mailing.rescheduled" : "client_mailing.scheduled",
        page: "clients/mailings",
        resource_type: "client_email_campaign",
        resource_id: campaign.id,
        resource_label: campaign.subject,
        metadata: { scheduled_for: scheduled.toISOString(), recipients: recipients.length },
      }).catch(() => undefined);
      await notifyAdminFeatureEvent({
        permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.mailings,
        title: `${campaign.status === "scheduled" ? "Client mailing rescheduled" : "Client mailing scheduled"}: ${campaign.subject}`,
        body: `${recipients.length} individual email${recipients.length === 1 ? "" : "s"} will be sent at the scheduled time.`,
        link: "/admin/clients/mailings",
        eyebrow: "Sales Hub · Client mailings",
        details: { Recipients: recipients.length, Scheduled: scheduled.toISOString() },
      }).catch(() => undefined);
      return NextResponse.json({ ok: true, campaign: updated, recipient_count: recipients.length });
    }

    if (action === "send") {
      const campaignId = text(body.campaign_id, 80);
      if (!isUuid(campaignId)) return NextResponse.json({ error: "Save the mailing before sending it." }, { status: 400 });
      const result = await deliverClientMailing({ campaignId, mode: "manual", actor: session.email });
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: "Unsupported mailing action." }, { status: 400 });
  } catch (error) {
    const databaseCode = String((error as { code?: unknown } | null)?.code || "");
    return NextResponse.json(
      { error: databaseCode === "23505" ? "A client with that email address already exists." : error instanceof Error ? error.message : "Mailing action failed." },
      { status: error instanceof ClientMailingError ? error.status : databaseCode === "23505" ? 409 : 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "clients.mailings.send");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const campaignId = text(body.campaign_id, 80);
  if (!isUuid(campaignId)) return NextResponse.json({ error: "Invalid mailing ID." }, { status: 400 });

  try {
    const deleted = await glashMaybeOne<{ id: string; subject: string; cover_storage_path: string | null }>(
      `delete from public.client_email_campaigns
        where id=$1::uuid and status='scheduled'
        returning id, subject, cover_storage_path`,
      [campaignId],
    );
    if (!deleted) return NextResponse.json({ error: "This scheduled mailing is already being processed or no longer exists." }, { status: 409 });
    if (deleted.cover_storage_path) {
      const db = getGlashDbAdmin() as any;
      await db.storage.from(CLIENT_MAILING_IMAGE_BUCKET).remove([deleted.cover_storage_path]).catch(() => undefined);
    }
    await logActivity({
      action: "client_mailing.scheduled_deleted",
      page: "clients/mailings",
      resource_type: "client_email_campaign",
      resource_id: deleted.id,
      resource_label: deleted.subject,
      metadata: { deleted_by: session.email },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scheduled mailing could not be deleted." }, { status: 500 });
  }
}
