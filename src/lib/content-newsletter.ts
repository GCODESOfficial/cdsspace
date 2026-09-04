/**
 * DAILY News Letter.
 *
 * A Content Hub post that carries an image goes to every registered client by
 * email at the moment it publishes, so the mailing list sees the same thing the
 * social channels do without anyone assembling a separate campaign.
 *
 * Two rules decide whether an item qualifies, and both are enforced here rather
 * than at the call site, so the cron, a manual publish and the admin UI cannot
 * disagree about what gets mailed:
 *
 *   - it must have at least one image attached (text-only posts are not mailed)
 *   - Word of the Day is never mailed, however many images it carries
 *
 * The send is claimed with a conditional update before any mail goes out. An
 * item scheduled to three platforms fires this three times, and a cron that
 * overlaps its previous run fires it again; only the first claim wins.
 */
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getUnifiedClientDirectory } from "@/lib/client-directory-server";
import { brandedEmailHtml } from "@/lib/email-template";
import { createEmailTransport, sendEmail } from "@/lib/email-from";
import { NEWSLETTER_TITLE, isWordOfTheDay } from "@/lib/content-newsletter-shared";

export { NEWSLETTER_TITLE, isWordOfTheDay, newsletterApplies } from "@/lib/content-newsletter-shared";
export type { NewsletterCandidate } from "@/lib/content-newsletter-shared";

// The image is fetched and attached to the message. Anything larger than this
// is skipped rather than posted to every client's inbox.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_RECIPIENTS = 5000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 15px;color:#27324A;font-size:15px;line-height:1.7;">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

const IMAGE_CID = "dailynewsletter@cdsspace";

function emailHtml(input: { title: string; body: string; hasImage: boolean; ctaLabel?: string | null; ctaUrl?: string | null }) {
  const image = input.hasImage
    ? `<img src="cid:${IMAGE_CID}" alt="${escapeHtml(input.title)}" width="504" style="display:block;width:100%;max-width:504px;height:auto;margin:0 0 22px;border-radius:14px;" />`
    : "";
  const cta = input.ctaUrl && input.ctaLabel
    ? `<a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;margin-top:6px;padding:12px 18px;border-radius:9px;background:#0A4FE8;color:#ffffff;text-decoration:none;font-weight:700;">${escapeHtml(input.ctaLabel)}</a>`
    : "";
  return brandedEmailHtml(
    `${image}${input.title ? `<h2 style="margin:0 0 12px;color:#0D1B39;font-size:20px;">${escapeHtml(input.title)}</h2>` : ""}${paragraphs(input.body)}${cta}`,
    { eyebrow: NEWSLETTER_TITLE, preheader: input.title || NEWSLETTER_TITLE },
  );
}

async function fetchImage(url: string): Promise<{ content: Buffer; contentType: string; filename: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
    return {
      content: buffer,
      contentType: type,
      filename: url.split("/").pop()?.split("?")[0] || "newsletter.jpg",
    };
  } catch {
    // A missing asset must not stop the mailing; it goes out as text.
    return null;
  }
}

export interface NewsletterResult {
  status: "sent" | "skipped";
  reason?: string;
  sent?: number;
  failed?: number;
}

/**
 * Mails one published content item to the client list. Safe to call more than
 * once for the same item: only the first call that claims it sends anything.
 */
export async function sendContentNewsletter(contentId: string): Promise<NewsletterResult> {
  const item = await glashMaybeOne<{
    id: string; title: string; body: string; series: string | null; campaign: string | null;
    cta_label: string | null; cta_url: string | null;
    newsletter_enabled: boolean | null; newsletter_sent_at: string | null;
  }>(
    `select id, title, body, series, campaign, cta_label, cta_url, newsletter_enabled, newsletter_sent_at
       from public.content_items where id = $1 limit 1`,
    [contentId],
  );
  if (!item) return { status: "skipped", reason: "Content not found." };
  if (item.newsletter_enabled === false) return { status: "skipped", reason: "Newsletter is switched off for this item." };
  if (item.newsletter_sent_at) return { status: "skipped", reason: "Already sent." };
  if (isWordOfTheDay(item)) return { status: "skipped", reason: "Word of the Day is never mailed." };

  const images = await glashQuery<{ url: string }>(
    `select url from public.content_media where content_id = $1 and kind = 'image' order by position asc, created_at asc limit 1`,
    [contentId],
  );
  if (!images.length) return { status: "skipped", reason: "No image attached." };

  // Claim before sending. The condition repeats every rule above so two workers
  // racing on the same item cannot both get past it.
  const claim = await glashMaybeOne<{ id: string }>(
    `update public.content_items
        set newsletter_sent_at = now(), updated_at = now()
      where id = $1 and newsletter_sent_at is null and newsletter_enabled
      returning id`,
    [contentId],
  );
  if (!claim) return { status: "skipped", reason: "Another run is already sending this one." };

  try {
    // The unified directory is the same list the mailing campaigns use: manual
    // clients plus verified platform accounts, already de-duplicated.
    const { clients } = await getUnifiedClientDirectory();
    const recipients = new Map<string, { id: string | null; email: string }>();
    for (const entry of clients) {
      const email = String(entry.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      if (entry.status && entry.status !== "active") continue;
      if (!recipients.has(email)) recipients.set(email, { id: entry.id || null, email });
    }

    if (!recipients.size) {
      await glashQuery(
        `update public.content_items set newsletter_sent_count = 0, newsletter_failed_count = 0 where id = $1`,
        [contentId],
      );
      return { status: "skipped", reason: "No client has an email address." };
    }

    const image = await fetchImage(images[0].url);
    const html = emailHtml({
      title: item.title || "",
      body: item.body || "",
      hasImage: Boolean(image),
      ctaLabel: item.cta_label,
      ctaUrl: item.cta_url,
    });

    const transporter = createEmailTransport();
    let sent = 0;
    let failed = 0;
    try {
      for (const recipient of Array.from(recipients.values()).slice(0, MAX_RECIPIENTS)) {
        try {
          await sendEmail({
            to: recipient.email,
            subject: NEWSLETTER_TITLE,
            html,
            text: `${item.title}\n\n${item.body}`,
            fromName: "CDS Space",
            transporter,
            attachments: image
              ? [{ filename: image.filename, content: image.content, contentType: image.contentType, cid: IMAGE_CID }]
              : [],
          });
          sent += 1;
          await glashQuery(
            `insert into public.content_newsletter_sends (content_id, client_id, email, status)
             values ($1, $2, $3, 'sent') on conflict do nothing`,
            [contentId, recipient.id, recipient.email],
          );
        } catch (error) {
          failed += 1;
          await glashQuery(
            `insert into public.content_newsletter_sends (content_id, client_id, email, status, error)
             values ($1, $2, $3, 'failed', $4) on conflict do nothing`,
            [contentId, recipient.id, recipient.email, error instanceof Error ? error.message.slice(0, 500) : "Send failed."],
          );
        }
      }
    } finally {
      transporter.close();
    }

    await glashQuery(
      `update public.content_items set newsletter_sent_count = $2, newsletter_failed_count = $3 where id = $1`,
      [contentId, sent, failed],
    );
    return { status: "sent", sent, failed };
  } catch (error) {
    // Release the claim so the next run can try again rather than the mailing
    // being silently lost.
    await glashQuery(`update public.content_items set newsletter_sent_at = null where id = $1`, [contentId]);
    throw error;
  }
}
