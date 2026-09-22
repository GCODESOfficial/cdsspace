import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getUnifiedClientDirectory } from "@/lib/client-directory-server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne, glashPool, glashQuery } from "@/lib/glashdb/postgres";
import { brandedEmailHtml } from "@/lib/email-template";
import { createEmailTransport, sendEmail, verifyEmailReady } from "@/lib/email-from";
import { verifyNewAccountEmail } from "@/lib/email-verification-policy";
import { logActivity } from "@/lib/activity-log";
import { ADMIN_FEATURE_PERMISSION_KEYS, notifyAdminFeatureEvent } from "@/lib/admin-feature-notifications";

export const CLIENT_MAILING_IMAGE_BUCKET = "sales-mailing-images";
export const MAX_CLIENT_MAILING_RECIPIENTS = 1000;

export type ClientMailingSelection = {
  all_clients: boolean;
  selected_client_ids: string[];
  custom_emails: string[];
  pending_client?: {
    name: string;
    brand_name: string;
    email: string;
  };
};

export type ClientEmailCampaign = {
  id: string;
  subject: string;
  body_text: string;
  recipient_selection: ClientMailingSelection;
  cover_storage_path: string | null;
  cover_file_name: string | null;
  cover_mime_type: string | null;
  status: string;
  created_by: string;
  scheduled_for?: string | null;
};

type MailingRecipient = {
  clientKey: string | null;
  name: string;
  email: string;
  source: "client" | "custom";
};

type MailingCover = {
  content: Buffer;
  contentType: string;
  filename: string;
};

type RecipientRow = {
  id: string;
  recipient_name: string | null;
  email: string;
};

export class ClientMailingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ClientMailingError";
    this.status = status;
  }
}

export function mailingText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function quickMailingEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

export function cleanMailingSelection(value: unknown): ClientMailingSelection {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const selected = Array.isArray(raw.selected_client_ids) ? raw.selected_client_ids : [];
  const custom = Array.isArray(raw.custom_emails) ? raw.custom_emails : [];
  const pendingRaw = raw.pending_client && typeof raw.pending_client === "object"
    ? raw.pending_client as Record<string, unknown>
    : null;
  const pendingClient = pendingRaw ? {
    name: mailingText(pendingRaw.name, 180),
    brand_name: mailingText(pendingRaw.brand_name, 180),
    email: mailingText(pendingRaw.email, 254).toLowerCase(),
  } : null;
  return {
    all_clients: raw.all_clients === true,
    selected_client_ids: Array.from(new Set(selected.map((item) => mailingText(item, 100)).filter(Boolean))).slice(0, MAX_CLIENT_MAILING_RECIPIENTS),
    custom_emails: Array.from(new Set(custom.map(quickMailingEmail).filter((email): email is string => Boolean(email)))).slice(0, 250),
    ...(pendingClient && (pendingClient.name || pendingClient.brand_name || pendingClient.email)
      ? { pending_client: pendingClient }
      : {}),
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

export async function signedClientMailingPreview(path: string | null) {
  if (!path) return null;
  const db = getGlashDbAdmin() as any;
  const { data } = await db.storage.from(CLIENT_MAILING_IMAGE_BUCKET).createSignedUrl(path, 15 * 60);
  return data?.signedUrl || null;
}

export async function resolveClientMailingRecipients(campaign: ClientEmailCampaign) {
  if (campaign.subject.trim().length < 3) throw new ClientMailingError("Add an email subject.");
  if (campaign.body_text.trim().length < 10) throw new ClientMailingError("Write the email message.");

  const directory = await getUnifiedClientDirectory();
  const selection = cleanMailingSelection(campaign.recipient_selection);
  const chosenIds = new Set(selection.selected_client_ids);
  const chosenClients = directory.clients.filter((client) =>
    client.status !== "archived" && (selection.all_clients || chosenIds.has(client.id)),
  );
  const recipients = new Map<string, MailingRecipient>();
  for (const client of chosenClients) {
    const email = quickMailingEmail(client.email);
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

  if (!recipients.size) throw new ClientMailingError("Choose at least one client or enter a valid new email.");
  if (recipients.size > MAX_CLIENT_MAILING_RECIPIENTS) {
    throw new ClientMailingError(`A mailing can contain up to ${MAX_CLIENT_MAILING_RECIPIENTS} individual recipients.`);
  }

  const customChecks = await Promise.all(Array.from(recipients.values())
    .filter((recipient) => recipient.source === "custom")
    .map(async (recipient) => ({ recipient, result: await verifyNewAccountEmail(recipient.email) })));
  const invalidCustom = customChecks.filter((check) => !check.result.ok);
  if (invalidCustom.length) {
    throw new ClientMailingError(
      `One or more new email addresses cannot receive mail: ${invalidCustom.slice(0, 3).map((check) => check.recipient.email).join(", ")}.`,
    );
  }

  return Array.from(recipients.values());
}

async function loadCampaignCover(campaign: ClientEmailCampaign): Promise<MailingCover | null> {
  if (!campaign.cover_storage_path) return null;
  const db = getGlashDbAdmin() as any;
  const { data, error } = await db.storage.from(CLIENT_MAILING_IMAGE_BUCKET).download(campaign.cover_storage_path);
  if (error || !data) throw new ClientMailingError("The cover image could not be prepared. Upload it again.");
  return {
    content: Buffer.from(await data.arrayBuffer()),
    contentType: campaign.cover_mime_type || "image/jpeg",
    filename: campaign.cover_file_name || "campaign-cover.jpg",
  };
}

async function replaceRecipientRows(campaignId: string, recipients: MailingRecipient[]) {
  const client = await glashPool.connect();
  try {
    await client.query("begin");
    await client.query("delete from public.client_email_campaign_recipients where campaign_id = $1::uuid", [campaignId]);
    const result = await client.query<RecipientRow>(
      `insert into public.client_email_campaign_recipients
         (campaign_id, client_key, recipient_name, email, source)
       select $1::uuid, recipient.client_key, recipient.recipient_name, recipient.email, recipient.source
         from jsonb_to_recordset($2::jsonb) as recipient(
           client_key text, recipient_name text, email text, source text
         )
       returning id, recipient_name, email`,
      [campaignId, JSON.stringify(recipients.map((recipient) => ({
        client_key: recipient.clientKey,
        recipient_name: recipient.name,
        email: recipient.email,
        source: recipient.source,
      })))],
    );
    await client.query("commit");
    return result.rows;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function deliverRecipientBatch(
  campaign: ClientEmailCampaign,
  recipients: RecipientRow[],
  cover: MailingCover | null,
  transporter: ReturnType<typeof createEmailTransport>,
) {
  const results: Array<{ ok: boolean; email: string; error?: string }> = new Array(recipients.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(8, recipients.length) }, async () => {
    while (cursor < recipients.length) {
      const index = cursor++;
      const recipient = recipients[index];
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
        await glashQuery(
          "update public.client_email_campaign_recipients set status='sent', sent_at=now(), delivery_error=null where id=$1",
          [recipient.id],
        );
        results[index] = { ok: true, email: recipient.email };
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : "Delivery failed";
        await glashQuery(
          "update public.client_email_campaign_recipients set status='failed', delivery_error=$2 where id=$1",
          [recipient.id, message],
        ).catch(() => []);
        results[index] = { ok: false, email: recipient.email, error: message };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function deliverClientMailing(input: {
  campaignId: string;
  mode: "manual" | "scheduled";
  actor?: string;
}) {
  let claimed = false;
  let transporter: ReturnType<typeof createEmailTransport> | null = null;
  const campaign = input.mode === "scheduled"
    ? await glashMaybeOne<ClientEmailCampaign>(
      `update public.client_email_campaigns
          set status='sending', sent_count=0, failed_count=0,
              claimed_at=now(), last_error=null, updated_at=now()
        where id=$1::uuid and status='scheduled' and scheduled_for <= now()
        returning *`,
      [input.campaignId],
    )
    : await glashMaybeOne<ClientEmailCampaign>(
      `select * from public.client_email_campaigns
        where id = $1::uuid
          and ((status = 'draft' and created_by = $2) or status = 'scheduled')
        limit 1`,
      [input.campaignId, input.actor || ""],
    );
  if (!campaign) throw new ClientMailingError(
    input.mode === "manual" ? "This mailing is unavailable or has already been sent." : "This scheduled mailing is no longer due.",
    409,
  );
  claimed = input.mode === "scheduled";

  try {
    const recipients = await resolveClientMailingRecipients(campaign);
    const cover = await loadCampaignCover(campaign);
    transporter = createEmailTransport();
    const emailError = await verifyEmailReady(transporter);
    if (emailError) throw new ClientMailingError(emailError, 503);

    if (input.mode === "manual") {
      const manualClaim = await glashMaybeOne<{ id: string }>(
        `update public.client_email_campaigns
            set status='sending', recipient_count=$2, sent_count=0, failed_count=0,
                scheduled_for=null, claimed_at=now(), last_error=null, updated_at=now()
          where id=$1::uuid
            and ((status='draft' and created_by=$3) or status='scheduled')
          returning id`,
        [campaign.id, recipients.length, input.actor || ""],
      );
      if (!manualClaim) throw new ClientMailingError("This mailing is already being processed.", 409);
      claimed = true;
    } else {
      await glashQuery(
        "update public.client_email_campaigns set recipient_count=$2 where id=$1::uuid and status='sending'",
        [campaign.id, recipients.length],
      );
    }

    const recipientRows = await replaceRecipientRows(campaign.id, recipients);
    const deliveryResults = await deliverRecipientBatch(campaign, recipientRows, cover, transporter);
    const sentCount = deliveryResults.filter((result) => result.ok).length;
    const failed = deliveryResults.filter((result) => !result.ok);
    const status = sentCount === deliveryResults.length ? "sent" : sentCount > 0 ? "partial_failed" : "failed";
    await glashQuery(
      `update public.client_email_campaigns
          set status=$2, sent_count=$3, failed_count=$4,
              sent_at=case when $3 > 0 then now() else null end,
              claimed_at=null, last_error=$5, updated_at=now()
        where id=$1`,
      [campaign.id, status, sentCount, failed.length, failed[0]?.error || null],
    );
    await logActivity({
      action: input.mode === "scheduled" ? "client_mailing.scheduled_sent" : "client_mailing.sent",
      page: "clients/mailings",
      resource_type: "client_email_campaign",
      resource_id: campaign.id,
      resource_label: campaign.subject,
      metadata: { recipients: deliveryResults.length, sent: sentCount, failed: failed.length },
    }).catch(() => undefined);
    await notifyAdminFeatureEvent({
      permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.mailings,
      title: `Client mailing sent: ${campaign.subject}`,
      body: `${sentCount} of ${deliveryResults.length} individual emails were delivered${failed.length ? `; ${failed.length} need attention` : ""}.`,
      link: "/admin/clients/mailings",
      eyebrow: "Sales Hub · Client mailings",
      details: { Sent: sentCount, Failed: failed.length, Total: deliveryResults.length },
    }).catch(() => undefined);
    return {
      campaign_id: campaign.id,
      status,
      recipient_count: deliveryResults.length,
      sent_count: sentCount,
      failed_count: failed.length,
    };
  } catch (error) {
    if (claimed) await glashQuery(
      `update public.client_email_campaigns
          set status='failed', failed_count=recipient_count, claimed_at=null,
              last_error=$2, updated_at=now()
        where id=$1 and status='sending'`,
      [campaign.id, error instanceof Error ? error.message.slice(0, 1000) : "Mailing delivery failed."],
    ).catch(() => []);
    throw error;
  } finally {
    transporter?.close();
  }
}
