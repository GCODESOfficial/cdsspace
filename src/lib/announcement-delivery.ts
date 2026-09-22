/**
 * Announcement → message-page delivery.
 *
 * Announcements already drop a notification row (bell). On top of that, the
 * ops team wants every announcement to ALSO land in the recipient's chat so
 * they see "a message from CDS Space" on their normal Messages page:
 *
 *   - Clients   → a chat_messages row in their `client_<id>` room, sent as
 *                 admin (the CEO profile), so it shows in the dashboard inbox.
 *   - Team      → a per-member Direct thread flagged `includes_admin`, which
 *                 the team chat panel renders as a message from "Admin". One
 *                 reusable thread per member (marked name='CDS Space') so we
 *                 don't spawn a new thread on every announcement.
 *
 * Everything here is best-effort: a chat-delivery failure must never fail the
 * announcement itself, so callers should not depend on the return for success.
 */
import { emailFrom, createEmailTransport, EMAIL_MODE } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";
import { glashQuery, glashMaybeOne } from "@/lib/glashdb/postgres";
import { emailAttachmentsFor } from "@/lib/email-logo";

/** Marker name used to find/reuse the admin↔member announcement DM thread. */
const TEAM_ANNOUNCEMENT_THREAD_NAME = "CDS Space";
const CEO_EMAIL = "ceo@cdsspace.pro";

/** Combine the title + body into a single readable chat message. */
function composeChatBody(title: string, message: string): string {
  const t = title.trim();
  const m = message.trim();
  if (!t) return m;
  return `📣 ${t}\n\n${m}`;
}

/**
 * Drop the announcement into each client's dashboard chat room as an admin
 * message. Returns the number of rooms written. No-ops (safely) if the CEO
 * profile that owns admin chat messages can't be resolved.
 */
export async function deliverAnnouncementToClientChat(
  clientUserIds: string[],
  title: string,
  message: string,
  imageUrl: string | null = null,
): Promise<number> {
  if (clientUserIds.length === 0) return 0;

  const ceo = await glashMaybeOne<{ id: string }>(
    `select id from public.profiles where lower(email) = $1 limit 1`,
    [CEO_EMAIL],
  );
  // chat_messages.sender_id is a FK to profiles - without an admin profile we
  // can't author the message, so skip the chat copy (bell notice still fired).
  if (!ceo) return 0;

  const body = composeChatBody(title, message);
  await glashQuery(
    `insert into public.chat_messages (room_id, sender_id, sender_role, message, file_url, metadata)
     select 'client_' || cid, $1::uuid, 'admin', $2, $4,
            jsonb_build_object('kind', 'announcement', 'title', $5)
       from unnest($3::uuid[]) as t(cid)`,
    [ceo.id, body, clientUserIds, imageUrl, title],
  );
  return clientUserIds.length;
}

/**
 * Drop the announcement into each team member's chat as an admin Direct
 * message. Reuses a per-member "CDS Space" thread when one already exists.
 * Returns the number of members messaged.
 */
export async function deliverAnnouncementToTeamChat(
  teamMemberIds: string[],
  title: string,
  message: string,
): Promise<number> {
  if (teamMemberIds.length === 0) return 0;

  // 1. Which members already have a reusable announcement thread?
  const existing = await glashQuery<{ team_member_id: string; thread_id: string }>(
    `select p.team_member_id, t.id as thread_id
       from public.team_chat_threads t
       join public.team_chat_participants p on p.thread_id = t.id
      where t.kind = 'direct'
        and t.includes_admin = true
        and t.name = $1
        and p.team_member_id = any($2::uuid[])`,
    [TEAM_ANNOUNCEMENT_THREAD_NAME, teamMemberIds],
  );

  const threadByMember = new Map<string, string>();
  for (const row of existing) threadByMember.set(row.team_member_id, row.thread_id);

  // 2. Create a thread for any member that doesn't have one yet. Team rosters
  //    are small, so a per-member create loop is fine and keeps the
  //    thread→member mapping unambiguous.
  const missing = teamMemberIds.filter((id) => !threadByMember.has(id));
  for (const memberId of missing) {
    const thread = await glashMaybeOne<{ id: string }>(
      `insert into public.team_chat_threads (kind, name, includes_admin, last_message_at, updated_at)
       values ('direct', $1, true, now(), now())
       returning id`,
      [TEAM_ANNOUNCEMENT_THREAD_NAME],
    );
    if (!thread) continue;
    await glashQuery(
      `insert into public.team_chat_participants (thread_id, team_member_id)
       values ($1, $2)
       on conflict (thread_id, team_member_id) do nothing`,
      [thread.id, memberId],
    );
    threadByMember.set(memberId, thread.id);
  }

  const threadIds = Array.from(threadByMember.values());
  if (threadIds.length === 0) return 0;

  // 3. One admin message per thread, then bump activity so it sorts to top.
  const body = composeChatBody(title, message);
  await glashQuery(
    `insert into public.team_chat_messages (thread_id, sender_is_admin, body)
     select unnest($1::uuid[]), true, $2`,
    [threadIds, body],
  );
  await glashQuery(
    `update public.team_chat_threads
        set last_message_at = now(), updated_at = now()
      where id = any($1::uuid[])`,
    [threadIds],
  );

  return threadByMember.size;
}

/** Minimal branded HTML wrapper for an announcement email. */
function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function announcementEmailHtml(title: string, message: string, link: string | null, imageUrl: string | null): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br/>");
  const cta = link
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0A4FE8;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px">Open in CDS Space</a></p>`
    : "";
  const visual = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${safeTitle}" style="display:block;width:100%;max-height:420px;object-fit:cover;border-radius:14px;margin:0 0 20px;" />`
    : "";
  return brandedEmailHtml(
    `
      ${visual}
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0D1B39;">${safeTitle}</h1>
      <p style="margin:0;color:#4B5563;font-size:15px;line-height:1.6;">${safeMessage}</p>
      ${cta}
      <p style="margin:24px 0 0;color:#9CA3AF;font-size:12px;">You're receiving this because you have a CDS Space account.</p>
    `,
    { eyebrow: "Announcement", preheader: title },
  );
}

/**
 * Email the announcement to a list of client addresses. Best-effort and
 * resilient - individual failures are tallied, not thrown. Returns how many
 * emails were accepted by the transport. No-ops if email isn't configured.
 */
export async function deliverAnnouncementByEmail(
  emails: string[],
  title: string,
  message: string,
  link: string | null,
  imageUrl: string | null = null,
): Promise<{ sent: number; failed: number }> {
  const recipients = Array.from(
    new Set(emails.map((e) => (e || "").trim().toLowerCase()).filter(Boolean)),
  );
  if (recipients.length === 0) return { sent: 0, failed: 0 };
  // HTTPS transports (Gmail API / Resend) don't need EMAIL_PASS; SMTP does.
  if (EMAIL_MODE === "smtp" && (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)) return { sent: 0, failed: 0 };

  const transporter = createEmailTransport();
  const html = announcementEmailHtml(title, message, link, imageUrl);

  const results = await Promise.allSettled(
    recipients.map((to) =>
      transporter.sendMail({
        from: emailFrom("CDS Space"),
        to,
        subject: title,
        html,
        attachments: emailAttachmentsFor(html),
      }),
    ),
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  return { sent, failed: results.length - sent };
}
