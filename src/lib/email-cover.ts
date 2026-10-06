import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * An optional image at the top of a first email or a proposal email.
 *
 * The image travels inside the email as an inline attachment, so no storage
 * address ever appears in a message that leaves CDS Space. The admin preview
 * reads it back through the authenticated upload route, never a signed URL.
 */

export const EMAIL_COVER_BUCKET = "deals-assets";
export const EMAIL_COVER_PREFIX = "email-covers/";
export const EMAIL_COVER_CID = "email-cover";

export function isEmailCoverPath(value: unknown): value is string {
  return typeof value === "string"
    && value.startsWith(EMAIL_COVER_PREFIX)
    && /^email-covers\/[0-9a-f-]{36}\.webp$/i.test(value);
}

/** Where the admin preview reads a cover from. */
export function emailCoverPreviewUrl(path: string) {
  return `/api/admin/deals/upload?path=${encodeURIComponent(path)}`;
}

export async function loadEmailCover(path: string) {
  if (!isEmailCoverPath(path)) throw new Error("That cover image is not valid. Upload it again.");
  const storage = getSupabaseAdmin() as any;
  const { data, error } = await storage.storage.from(EMAIL_COVER_BUCKET).download(path);
  if (error || !data) throw new Error("The cover image could not be prepared. Upload it again.");
  return { filename: "cover.webp", content: Buffer.from(await data.arrayBuffer()), contentType: "image/webp", cid: EMAIL_COVER_CID };
}

/** The image as it sits above the message, referencing the inline attachment. */
export function emailCoverHtml(src = `cid:${EMAIL_COVER_CID}`) {
  return `<img src="${src}" alt="" width="504" style="display:block;width:100%;max-width:504px;height:auto;margin:0 0 22px;border-radius:14px;" />`;
}
