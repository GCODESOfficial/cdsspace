/**
 * Wraps email body content in a branded CDS Space shell with the logo at the
 * top. This is what makes outgoing mail visibly CDS-branded regardless of the
 * recipient's client (the Gmail circular avatar is a separate, account/BIMI
 * concern that can't be set from the message itself).
 *
 * Uses table + inline styles for broad email-client compatibility, and an
 * absolute HTTPS logo URL (email clients can't load relative or local images).
 */
import { EMAIL_LOGO_CID } from "@/lib/email-logo";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://cdsspace.pro";
// The logo travels with the message as an inline CID attachment (see
// email-logo.ts + sendEmail), so it renders even when no hosted image is
// reachable. sendEmail attaches the bytes whenever this cid appears in the html.
const LOGO_SRC = `cid:${EMAIL_LOGO_CID}`;
const BRAND = "#0A4FE8";
const NAVY = "#0D1B39";

export interface BrandedEmailOptions {
  /** Optional small line under the logo, e.g. "Applicant Screening". */
  eyebrow?: string;
  /** Hidden preheader text shown in inbox previews. */
  preheader?: string;
}

/** Wrap inner HTML in the branded CDS Space email shell. */
export function brandedEmailHtml(bodyHtml: string, opts: BrandedEmailOptions = {}): string {
  const year = new Date().getFullYear();
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>`
    : "";
  const eyebrow = opts.eyebrow
    ? `<div style="margin-top:8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${BRAND};">${opts.eyebrow}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6fb;">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6eaf2;border-radius:16px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:28px 24px 8px 24px;">
              <img src="${LOGO_SRC}" width="56" height="56" alt="CDS Space" style="display:block;width:56px;height:56px;border-radius:14px;" />
              <div style="margin-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800;color:${NAVY};">CDS Space</div>
              ${eyebrow}
            </td>
          </tr>
          <tr>
            <td style="padding:12px 28px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#374151;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background:#0D1B39;font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:12px;color:#9fb0d6;line-height:1.6;">
                &copy; ${year} CDS Space - Branding Agency<br/>
                <a href="${SITE_URL}" style="color:#8ab0ff;text-decoration:none;">cdsspace.pro</a>
                &nbsp;&middot;&nbsp; support@cdsspace.pro
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
