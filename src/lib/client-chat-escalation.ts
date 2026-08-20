import { brandedEmailHtml } from "@/lib/email-template";
import { createEmailTransport, EMAIL_MODE, sendEmail } from "@/lib/email-from";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

const ALERT_AFTER_MINUTES = 30;
const CLAIM_EXPIRY_MINUTES = 15;
const ALERT_RECIPIENTS = [
  "contact.cdsspace@gmail.com",
  "christian.john161@gmail.com",
];

interface DueClientMessage {
  id: string;
  room_id: string;
  sender_id: string | null;
  message: string;
  file_url: string | null;
  source: string | null;
  created_at: string;
}

interface ClaimedEscalation {
  id: string;
  attempts: number;
}

interface ClientProfile {
  id: string;
  email: string | null;
  full_name: string | null;
}

export interface ClientChatEscalationResult {
  due: number;
  claimed: number;
  emailed: number;
  failed: number;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clientLabel(message: DueClientMessage, profiles: Map<string, ClientProfile>) {
  const profile = message.sender_id ? profiles.get(message.sender_id) : null;
  if (profile?.full_name?.trim()) return profile.full_name.trim();
  if (profile?.email?.trim()) return profile.email.trim();
  if (message.room_id.startsWith("whatsapp_")) return "WhatsApp client";
  if (message.room_id.startsWith("instagram_")) return "Instagram client";
  if (message.room_id.startsWith("facebook_")) return "Facebook client";
  return "CDS Space client";
}

function messagePreview(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 500 ? `${compact.slice(0, 500)}…` : compact;
}

async function loadProfiles(messages: DueClientMessage[]) {
  const ids = Array.from(new Set(messages.map((message) => message.sender_id).filter((id): id is string => Boolean(id))));
  if (!ids.length) return new Map<string, ClientProfile>();
  const profiles = await glashQuery<ClientProfile>(
    `select id::text, email, full_name
       from public.profiles
      where id::text = any($1::text[])`,
    [ids],
  ).catch(() => []);
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

/**
 * Email the support team once when the oldest message in a currently
 * unanswered client-message streak has been waiting for 30 minutes.
 */
export async function processClientChatEscalations(): Promise<ClientChatEscalationResult> {
  const due = await glashQuery<DueClientMessage>(
    `with unanswered as (
       select m.id::text, m.room_id, m.sender_id::text, m.message, m.file_url,
              m.source, m.created_at,
              row_number() over (partition by m.room_id order by m.created_at asc) as streak_position
         from public.chat_messages m
        where m.sender_role = 'client'
          and m.created_at <= now() - make_interval(mins => $1::int)
          and not exists (
            select 1
              from public.chat_messages reply
             where reply.room_id = m.room_id
               and reply.sender_role = 'admin'
               and reply.created_at > m.created_at
          )
     )
     select u.id, u.room_id, u.sender_id, u.message, u.file_url, u.source, u.created_at
       from unanswered u
       left join public.client_chat_response_escalations e on e.message_id::text = u.id
      where u.streak_position = 1
        and e.sent_at is null
      order by u.created_at asc
      limit 50`,
    [ALERT_AFTER_MINUTES],
  );

  const result: ClientChatEscalationResult = { due: due.length, claimed: 0, emailed: 0, failed: 0 };
  if (!due.length) return result;

  const profiles = await loadProfiles(due);
  const canEmail = EMAIL_MODE !== "smtp" || Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
  if (!canEmail) throw new Error("Chat/Meet escalation email is not configured.");
  const transporter = createEmailTransport();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://cdsspace.pro").replace(/\/$/, "");

  try {
    for (const message of due) {
      const claim = await glashMaybeOne<ClaimedEscalation>(
        `insert into public.client_chat_response_escalations
           (message_id, room_id, client_message_at, claimed_at, attempts, updated_at)
         values ($1::uuid, $2, $3::timestamptz, now(), 1, now())
         on conflict (message_id) do update
           set claimed_at = now(),
               attempts = public.client_chat_response_escalations.attempts + 1,
               last_error = null,
               updated_at = now()
         where public.client_chat_response_escalations.sent_at is null
           and (
             public.client_chat_response_escalations.claimed_at is null
             or public.client_chat_response_escalations.claimed_at < now() - make_interval(mins => $4::int)
           )
         returning id::text, attempts`,
        [message.id, message.room_id, message.created_at, CLAIM_EXPIRY_MINUTES],
      );
      if (!claim) continue;
      result.claimed++;

      const name = clientLabel(message, profiles);
      const receivedAt = new Date(message.created_at).toLocaleString("en-NG", {
        timeZone: "Africa/Lagos",
        dateStyle: "medium",
        timeStyle: "short",
      });
      const adminLink = `${siteUrl}/admin/messages?room=${encodeURIComponent(message.room_id)}`;
      const preview = messagePreview(message.message || (message.file_url ? "The client sent an attachment." : "New client message"));
      const subject = `Response needed: ${name} has waited 30 minutes`;
      const html = brandedEmailHtml(
        `<h2 style="margin:0 0 10px;color:#0D1B39;">A client is waiting for a response</h2>
         <p style="margin:0 0 14px;color:#4B5563;"><strong>${escapeHtml(name)}</strong> sent a message at ${escapeHtml(receivedAt)} and has not received an admin reply within ${ALERT_AFTER_MINUTES} minutes.</p>
         <div style="margin:0 0 18px;padding:14px 16px;border:1px solid #DDE5F4;border-radius:10px;background:#F7F9FD;color:#27324A;">${escapeHtml(preview)}</div>
         <a href="${escapeHtml(adminLink)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#0A4FE8;color:#ffffff;text-decoration:none;font-weight:700;">Open Chat/Meet</a>`,
        { eyebrow: "Sales Hub · Chat/Meet", preheader: `${name} is waiting for a reply.` },
      );

      try {
        await sendEmail({
          to: ALERT_RECIPIENTS.join(", "),
          subject,
          html,
          fromName: "CDS Space Chat/Meet",
          transporter,
        });
        await glashQuery(
          `update public.client_chat_response_escalations
              set sent_at = now(), claimed_at = null, last_error = null, updated_at = now()
            where id = $1::uuid`,
          [claim.id],
        );
        result.emailed++;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Email delivery failed";
        await glashQuery(
          `update public.client_chat_response_escalations
              set claimed_at = null, last_error = left($2, 1000), updated_at = now()
            where id = $1::uuid`,
          [claim.id, reason],
        );
        result.failed++;
      }
    }
  } finally {
    transporter.close();
  }

  return result;
}
