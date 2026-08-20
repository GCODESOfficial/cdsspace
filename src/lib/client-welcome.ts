import "server-only";

import { brandedEmailHtml } from "@/lib/email-template";
import { sendEmail } from "@/lib/email-from";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

type WelcomeRecipient = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type WelcomeSetting = {
  message: string;
  updated_at: string;
};

const BLOCKED_EMAILS = new Set(["ceo@cdsspace.pro", "admin@cdsspace.pro"]);

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function welcomeEmailBody(message: string) {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      let safe = escapeHtml(paragraph).replace(/\n/g, "<br/>");
      safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      safe = safe.replace(
        /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" style="color:#0A4FE8;text-decoration:underline;">$1</a>',
      );
      return `<p style="margin:0 0 16px;">${safe}</p>`;
    })
    .join("");

  return brandedEmailHtml(paragraphs, {
    eyebrow: "Welcome to CDS Space",
    preheader: "Your CDS Space account is ready.",
  });
}

export async function deliverClientWelcome(userId: string) {
  const recipient = await glashMaybeOne<WelcomeRecipient>(
    `select id, email, full_name
       from public.profiles
      where id = $1::uuid and email_verified_at is not null and account_status = 'active'
      limit 1`,
    [userId],
  );
  const normalizedEmail = recipient?.email?.trim().toLowerCase() || "";
  if (!recipient || !normalizedEmail || BLOCKED_EMAILS.has(normalizedEmail)) {
    return { chat: false, email: false, skipped: true };
  }

  const setting = await glashMaybeOne<WelcomeSetting>(
    `select message, updated_at
       from public.client_chat_welcome_settings
      where id = 1 and is_active = true`,
  );
  if (!setting?.message.trim()) return { chat: false, email: false, skipped: true };

  await glashQuery(
    `insert into public.chat_messages (
       room_id, sender_id, sender_role, message, is_read, source,
       message_type, delivery_status, sent_at, metadata
     ) values (
       'client_' || $1::text, null, 'admin', $2, false, 'web',
       'text', 'sent', now(), jsonb_build_object(
         'kind', 'client_welcome',
         'automated', true,
         'template_updated_at', $3::timestamptz
       )
     ) on conflict do nothing`,
    [recipient.id, setting.message, setting.updated_at],
  );

  await glashQuery(
    `insert into public.client_welcome_deliveries (
       user_id, chat_delivered_at, template_updated_at
     ) values ($1::uuid, now(), $2::timestamptz)
     on conflict (user_id) do update
       set chat_delivered_at = coalesce(public.client_welcome_deliveries.chat_delivered_at, excluded.chat_delivered_at),
           template_updated_at = excluded.template_updated_at,
           updated_at = now()`,
    [recipient.id, setting.updated_at],
  );

  const claimed = await glashMaybeOne<{ user_id: string }>(
    `update public.client_welcome_deliveries
        set email_attempted_at = now(), email_error = null, updated_at = now()
      where user_id = $1::uuid
        and email_sent_at is null
        and (email_attempted_at is null or email_attempted_at < now() - interval '5 minutes')
      returning user_id`,
    [recipient.id],
  );
  if (!claimed) return { chat: true, email: false, skipped: false };

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: "Welcome to CDS Space: let’s build something remarkable",
      html: welcomeEmailBody(setting.message),
      text: setting.message,
    });
    await glashQuery(
      `update public.client_welcome_deliveries
          set email_sent_at = now(), email_error = null, updated_at = now()
        where user_id = $1::uuid`,
      [recipient.id],
    );
    return { chat: true, email: true, skipped: false };
  } catch (error) {
    await glashQuery(
      `update public.client_welcome_deliveries
          set email_error = $2, updated_at = now()
        where user_id = $1::uuid`,
      [recipient.id, String(error instanceof Error ? error.message : error).slice(0, 1000)],
    );
    throw error;
  }
}

export async function backfillClientWelcomes(limit = 100) {
  const recipients = await glashQuery<{ id: string }>(
    `select p.id
      from public.profiles p
       left join public.client_welcome_deliveries d on d.user_id = p.id
      where p.email_verified_at is not null
        and p.account_status = 'active'
        and coalesce(lower(p.email), '') not in ('', 'ceo@cdsspace.pro', 'admin@cdsspace.pro')
        and (d.user_id is null or d.chat_delivered_at is null or d.email_sent_at is null)
      order by p.created_at asc
      limit $1`,
    [Math.max(1, Math.min(limit, 100))],
  );

  const results: PromiseSettledResult<Awaited<ReturnType<typeof deliverClientWelcome>>>[] = [];
  for (let index = 0; index < recipients.length; index += 10) {
    const batch = recipients.slice(index, index + 10);
    results.push(...await Promise.allSettled(batch.map((recipient) => deliverClientWelcome(recipient.id))));
  }
  return {
    selected: recipients.length,
    delivered: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}
