const SOCIAL_PLATFORM_URL =
  /(?:facebook\.com|instagram\.com|tiktok\.com|(?:twitter|x)\.com|linkedin\.com|youtube\.com)/i;

const ENGAGEMENT_REQUEST =
  /\b(?:engag|like|comment|share|repost|retweet|support|give\s+(?:it|this)\s+(?:some\s+)?love)\w*\b/i;

/**
 * Recognises team posts that ask colleagues to engage on social media.
 * Multiple social links are enough on their own; a single link also qualifies
 * when the surrounding message contains a clear engagement request.
 */
export function isSocialEngagementPost(body: string | null | undefined) {
  if (!body) return false;
  const urls = body.match(/https?:\/\/[^\s]+/gi) || [];
  const socialLinks = urls.filter((url) => SOCIAL_PLATFORM_URL.test(url));
  return (
    socialLinks.length >= 2 ||
    (socialLinks.length === 1 && ENGAGEMENT_REQUEST.test(body))
  );
}
