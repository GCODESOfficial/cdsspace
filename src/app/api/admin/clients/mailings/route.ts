/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getUnifiedClientDirectory } from "@/lib/client-directory-server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { chatComplete } from "@/lib/ai/openai";
import { brandedEmailHtml } from "@/lib/email-template";
import { createEmailTransport, sendEmail, verifyEmailReady } from "@/lib/email-from";
import { verifyNewAccountEmail } from "@/lib/email-verification-policy";
import { logActivity } from "@/lib/activity-log";
import { ADMIN_FEATURE_PERMISSION_KEYS, notifyAdminFeatureEvent } from "@/lib/admin-feature-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const IMAGE_BUCKET = "sales-mailing-images";
const MAX_RECIPIENTS = 1000;

type Selection = {
  all_clients: boolean;
  selected_client_ids: string[];
  custom_emails: string[];
};

type Campaign = {
  id: string;
  subject: string;
  body_text: string;
  recipient_selection: Selection;
  cover_storage_path: string | null;
  cover_file_name: string | null;
  cover_mime_type: string | null;
  status: string;
  created_by: string;
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function quickEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

function cleanSelection(value: unknown): Selection {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const selected = Array.isArray(raw.selected_client_ids) ? raw.selected_client_ids : [];
  const custom = Array.isArray(raw.custom_emails) ? raw.custom_emails : [];
  return {
    all_clients: raw.all_clients === true,
    selected_client_ids: Array.from(new Set(selected.map((item) => text(item, 100)).filter(Boolean))).slice(0, MAX_RECIPIENTS),
    custom_emails: Array.from(new Set(custom.map(quickEmail).filter((email): email is string => Boolean(email)))).slice(0, 250),
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function bodyParagraphs(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 15px;">${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function campaignEmailHtml(input: { name: string; body: string; hasImage: boolean }) {
  const image = input.hasImage
    ? `<img src="cid:sales-mailing-cover" alt="Campaign visual" width="504" style="display:block;width:100%;max-width:504px;height:auto;margin:0 0 22px;border-radius:14px;" />`
    : "";
  return brandedEmailHtml(
    `${image}
     <p style="margin:0 0 15px;">Hello ${escapeHtml(input.name || "there")},</p>
     ${bodyParagraphs(input.body)}
     <p style="margin:22px 0 0;padding-top:16px;border-top:1px solid #E8EDF5;color:#69738D;font-size:12px;line-height:1.6;">This message was sent by CDS Space because you are a client or opted to receive a direct business communication. To stop future campaign emails, reply with “Unsubscribe”.</p>`,
    { eyebrow: "Client update", preheader: input.body.replace(/\s+/g, " ").slice(0, 180) },
  );
}

async function signedPreview(path: string | null) {
  if (!path) return null;
  const db = getGlashDbAdmin() as any;
  const { data } = await db.storage.from(IMAGE_BUCKET).createSignedUrl(path, 15 * 60);
  return data?.signedUrl || null;
}

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "clients.mailings.view");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [{ clients }, campaigns, draft] = await Promise.all([
      getUnifiedClientDirectory(),
      glashQuery<any>(
        `select id, subject, status, recipient_count, sent_count, failed_count, created_by, sent_at, created_at, updated_at
           from public.client_email_campaigns
          where status <> 'draft'
          order by updated_at desc
          limit 30`,
      ),
      glashMaybeOne<Campaign>(
        `select id, subject, body_text, recipient_selection, cover_storage_path, cover_file_name, cover_mime_type, status, created_by
           from public.client_email_campaigns
          where status = 'draft' and created_by = $1
          order by updated_at desc
          limit 1`,
        [session.email],
      ),
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
      }));
    return NextResponse.json({
      ok: true,
      clients: availableClients,
      campaigns,
      draft: draft ? { ...draft, preview_url: await signedPreview(draft.cover_storage_path) } : null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load client mailings." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body.action, 30);
  const permission = action === "send" ? "clients.mailings.send" : "clients.mailings.create";
  const { session, denied } = await requireAdmin(req, permission);
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
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
      const subject = text(body.subject, 200);
      const bodyText = text(body.body_text, 20_000);
      const selection = cleanSelection(body.recipient_selection);
      const coverPath = text(body.cover_storage_path, 500);
      const safeCoverPath = coverPath.startsWith("sales-mailings/") ? coverPath : null;
      const params = [
        subject,
        bodyText,
        JSON.stringify(selection),
        safeCoverPath,
        text(body.cover_file_name, 180) || null,
        text(body.cover_mime_type, 100) || null,
        session.email,
      ];
      let campaign: Campaign | null;
      if (campaignId) {
        campaign = await glashMaybeOne<Campaign>(
          `update public.client_email_campaigns
              set subject = $1, body_text = $2, recipient_selection = $3::jsonb,
                  cover_storage_path = $4, cover_file_name = $5, cover_mime_type = $6, updated_at = now()
            where id = $8::uuid and created_by = $7 and status = 'draft'
            returning *`,
          [...params, campaignId],
        );
        if (!campaign) return NextResponse.json({ error: "This mailing draft is no longer editable." }, { status: 409 });
      } else {
        campaign = await glashMaybeOne<Campaign>(
          `insert into public.client_email_campaigns
            (subject, body_text, recipient_selection, cover_storage_path, cover_file_name, cover_mime_type, created_by)
           values ($1,$2,$3::jsonb,$4,$5,$6,$7)
           returning *`,
          params,
        );
      }
      return NextResponse.json({ ok: true, campaign });
    }

    if (action === "send") {
      const campaignId = text(body.campaign_id, 80);
      if (!campaignId) return NextResponse.json({ error: "Save the mailing draft before sending." }, { status: 400 });
      const campaign = await glashMaybeOne<Campaign>(
        `select * from public.client_email_campaigns
          where id = $1::uuid and created_by = $2 and status = 'draft'
          limit 1`,
        [campaignId, session.email],
      );
      if (!campaign) return NextResponse.json({ error: "This mailing draft is unavailable or has already been sent." }, { status: 409 });
      if (campaign.subject.trim().length < 3) return NextResponse.json({ error: "Add an email subject." }, { status: 400 });
      if (campaign.body_text.trim().length < 10) return NextResponse.json({ error: "Write the email message." }, { status: 400 });

      const directory = await getUnifiedClientDirectory();
      const selection = cleanSelection(campaign.recipient_selection);
      const chosenIds = new Set(selection.selected_client_ids);
      const chosenClients = directory.clients.filter((client) =>
        client.status !== "archived" && (selection.all_clients || chosenIds.has(client.id)),
      );
      const recipients = new Map<string, { clientKey: string | null; name: string; email: string; source: "client" | "custom" }>();
      for (const client of chosenClients) {
        const email = quickEmail(client.email);
        if (email && !recipients.has(email)) recipients.set(email, {
          clientKey: client.id,
          name: client.contact_person || client.name || client.brand_name || "there",
          email,
          source: "client",
        });
      }
      for (const email of selection.custom_emails) {
        if (!recipients.has(email)) recipients.set(email, {
          clientKey: null,
          name: email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()),
          email,
          source: "custom",
        });
      }
      if (!recipients.size) return NextResponse.json({ error: "Choose at least one client or enter a valid new email." }, { status: 400 });
      if (recipients.size > MAX_RECIPIENTS) return NextResponse.json({ error: `A mailing can contain up to ${MAX_RECIPIENTS} individual recipients.` }, { status: 400 });

      const customChecks = await Promise.all(Array.from(recipients.values()).filter((recipient) => recipient.source === "custom").map(async (recipient) => ({
        recipient,
        result: await verifyNewAccountEmail(recipient.email),
      })));
      const invalidCustom = customChecks.filter((check) => !check.result.ok);
      if (invalidCustom.length) {
        return NextResponse.json({
          error: `One or more new email addresses cannot receive mail: ${invalidCustom.slice(0, 3).map((check) => check.recipient.email).join(", ")}.`,
        }, { status: 400 });
      }

      let cover: { content: Buffer; contentType: string; filename: string } | null = null;
      if (campaign.cover_storage_path) {
        const db = getGlashDbAdmin() as any;
        const { data, error } = await db.storage.from(IMAGE_BUCKET).download(campaign.cover_storage_path);
        if (error || !data) return NextResponse.json({ error: "The cover image could not be prepared. Upload it again." }, { status: 400 });
        cover = {
          content: Buffer.from(await data.arrayBuffer()),
          contentType: campaign.cover_mime_type || "image/jpeg",
          filename: campaign.cover_file_name || "campaign-cover.jpg",
        };
      }

      const transporter = createEmailTransport();
      const emailError = await verifyEmailReady(transporter);
      if (emailError) {
        transporter.close();
        return NextResponse.json({ error: emailError }, { status: 503 });
      }

      const claimed = await glashMaybeOne<{ id: string }>(
        `update public.client_email_campaigns
            set status = 'sending', recipient_count = $2, sent_count = 0, failed_count = 0,
                last_error = null, updated_at = now()
          where id = $1::uuid and created_by = $3 and status = 'draft'
          returning id`,
        [campaign.id, recipients.size, session.email],
      );
      if (!claimed) {
        transporter.close();
        return NextResponse.json({ error: "This mailing is already being sent." }, { status: 409 });
      }

      const db = getGlashDbAdmin() as any;
      await db.from("client_email_campaign_recipients").delete().eq("campaign_id", campaign.id);
      const { data: recipientRows, error: recipientError } = await db.from("client_email_campaign_recipients").insert(
        Array.from(recipients.values()).map((recipient) => ({
          campaign_id: campaign.id,
          client_key: recipient.clientKey,
          recipient_name: recipient.name,
          email: recipient.email,
          source: recipient.source,
        })),
      ).select("id, recipient_name, email");
      if (recipientError) {
        transporter.close();
        await glashQuery("update public.client_email_campaigns set status='draft', last_error=$2, updated_at=now() where id=$1", [campaign.id, recipientError.message]);
        return NextResponse.json({ error: recipientError.message }, { status: 500 });
      }

      const deliveryResults = await Promise.all((recipientRows || []).map(async (recipient: any) => {
        try {
          await sendEmail({
            to: recipient.email,
            subject: campaign.subject,
            text: `Hello ${recipient.recipient_name || "there"},\n\n${campaign.body_text}\n\nTo stop future campaign emails, reply with “Unsubscribe”.`,
            html: campaignEmailHtml({ name: recipient.recipient_name || "there", body: campaign.body_text, hasImage: Boolean(cover) }),
            fromName: "CDS Space",
            transporter,
            attachments: cover ? [{ filename: cover.filename, content: cover.content, contentType: cover.contentType, cid: "sales-mailing-cover" }] : undefined,
          });
          await glashQuery("update public.client_email_campaign_recipients set status='sent', sent_at=now(), delivery_error=null where id=$1", [recipient.id]);
          return { ok: true as const, email: recipient.email };
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 1000) : "Delivery failed";
          await glashQuery("update public.client_email_campaign_recipients set status='failed', delivery_error=$2 where id=$1", [recipient.id, message]).catch(() => []);
          return { ok: false as const, email: recipient.email, error: message };
        }
      }));
      transporter.close();

      const sentCount = deliveryResults.filter((result) => result.ok).length;
      const failed = deliveryResults.filter((result) => !result.ok);
      const status = sentCount === deliveryResults.length ? "sent" : sentCount > 0 ? "partial_failed" : "failed";
      await glashQuery(
        `update public.client_email_campaigns
            set status=$2, sent_count=$3, failed_count=$4, sent_at=case when $3 > 0 then now() else null end,
                last_error=$5, updated_at=now()
          where id=$1`,
        [campaign.id, status, sentCount, failed.length, failed[0]?.error || null],
      );
      await logActivity({
        action: "client_mailing.sent",
        page: "clients/mailings",
        resource_type: "client_email_campaign",
        resource_id: campaign.id,
        resource_label: campaign.subject,
        metadata: { recipients: deliveryResults.length, sent: sentCount, failed: failed.length },
      });
      await notifyAdminFeatureEvent({
        permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.mailings,
        title: `Client mailing sent: ${campaign.subject}`,
        body: `${sentCount} of ${deliveryResults.length} individual emails were delivered${failed.length ? `; ${failed.length} need attention` : ""}.`,
        link: "/admin/clients/mailings",
        eyebrow: "Sales Hub · Client mailings",
        details: { Sent: sentCount, Failed: failed.length, Total: deliveryResults.length },
      });
      return NextResponse.json({ ok: true, campaign_id: campaign.id, status, recipient_count: deliveryResults.length, sent_count: sentCount, failed_count: failed.length });
    }

    return NextResponse.json({ error: "Unsupported mailing action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mailing action failed." }, { status: 500 });
  }
}
