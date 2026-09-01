/**
 * The birthday email: the designed card, then the admin's message, inside the
 * standard branded shell.
 *
 * The card travels as an inline CID attachment for the same reason the logo
 * does - Gmail will not render an SVG and cannot be relied on to fetch a hosted
 * image. The preview shown in the admin swaps that cid for a data: URI, so what
 * the admin reads on screen is the same HTML the recipient receives.
 */
import { brandedEmailHtml } from "@/lib/email-template";
import type { BirthdayGender } from "@/lib/birthday-artwork";

export const BIRTHDAY_CARD_CID = "birthdaycard@cdsspace";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The admin's plain-text message as paragraphs, blank lines preserved. */
function messageHtml(message: string): string {
  return message
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 14px;color:#27324A;font-size:15px;line-height:1.65;">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/**
 * The subject repeats the greeting on the card rather than the client's name,
 * so the inbox line and the artwork say the same thing.
 */
export function birthdayEmailSubject(gender: BirthdayGender): string {
  return gender === "male" ? "Happy Birthday, Your Excellency" : "Happy Birthday, Her Excellency";
}

/**
 * The full email HTML. `cardSrc` is `cid:...` when sending and a data: URI when
 * previewing; pass null when the card could not be rendered and the message
 * should go out on its own.
 */
export function birthdayEmailHtml(gender: BirthdayGender, message: string, cardSrc: string | null): string {
  const card = cardSrc
    ? `<img src="${cardSrc}" width="512" alt="${birthdayEmailSubject(gender)} from CDS Space" style="display:block;width:100%;max-width:512px;height:auto;border-radius:12px;margin:0 0 20px;" />`
    : "";
  return brandedEmailHtml(
    `${card}${messageHtml(message)}`,
    { eyebrow: "Birthday wishes", preheader: birthdayEmailSubject(gender) },
  );
}
