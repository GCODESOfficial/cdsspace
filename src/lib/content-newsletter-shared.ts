/**
 * The DAILY News Letter rules, with no server imports.
 *
 * The publishing package (a client component) and the send worker (server) must
 * agree on exactly which content is mailed, so the decision lives here where
 * both can import it. Sending itself is in content-newsletter.ts, which pulls in
 * the database and the mail transport and must never reach the browser bundle.
 */

/** The subject line, and the name of the switch in the publishing package. */
export const NEWSLETTER_TITLE = "DAILY News Letter";

export interface NewsletterCandidate {
  series?: string | null;
  campaign?: string | null;
  newsletter_enabled?: boolean | null;
}

/**
 * Word of the Day is a daily social ritual, not a client mailing. It is
 * recognised by the series or campaign the generator stamps on it.
 */
export function isWordOfTheDay(item: NewsletterCandidate): boolean {
  const series = String(item.series || "").trim().toLowerCase();
  const campaign = String(item.campaign || "").trim().toLowerCase();
  return series === "wotd" || series === "word of the day" || campaign.includes("word of the day");
}

/** Whether the switch should be offered for this item at all. */
export function newsletterApplies(item: NewsletterCandidate, hasImage: boolean): boolean {
  return hasImage && !isWordOfTheDay(item);
}
