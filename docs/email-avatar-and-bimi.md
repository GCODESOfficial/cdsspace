# Sender avatar and BIMI logo for CDS Space email

This explains how to get the CDS Space logo to show as the **circular sender
avatar** in Gmail/Apple Mail (the icon next to "CDS Space <support@cdsspace.pro>"),
and the requirements for the verified **BIMI** brand logo.

The in-message logo (top of every email body) is already handled in code by
`brandedEmailHtml()` in `src/lib/email-template.ts`. The avatar and BIMI logo are
**account/DNS-level** and cannot be set from the message HTML.

---

## Important: how our mail is actually sent

From `src/lib/email-from.ts`, outgoing mail is authenticated by the personal
Gmail account `contact.cdsspace@gmail.com` and sent **as** the alias
`support@cdsspace.pro` via Gmail's "Send mail as" feature (Gmail API or SMTP).
A Resend HTTPS path also exists if `RESEND_API_KEY` is set.

This matters because the avatar and BIMI both depend on **who owns the From
address and how the message is signed (DKIM)**:

- Sending "as" an alias from a **personal** Gmail signs DKIM with `d=gmail.com`,
  **not** `d=cdsspace.pro`. That means DMARC does not align to `cdsspace.pro`,
  and **BIMI cannot work** on that path, no matter what DNS records we add.
- To get a real brand avatar/BIMI, `support@cdsspace.pro` needs to send over a
  path that DKIM-signs with the `cdsspace.pro` domain. Two options below.

---

## Option A - Quickest win: a real sender profile photo (no BIMI, no cost)

This removes the grey "M" placeholder and shows a logo avatar in Gmail for most
recipients. It does **not** give the verified/BIMI checkmark, but it is free and
takes minutes.

Pick whichever matches how `support@cdsspace.pro` really exists:

1. **If `support@cdsspace.pro` is a Google Workspace user** (recommended):
   - Sign in to that mailbox at mail.google.com (or have an admin do it).
   - Set the Google **account profile photo** to the CDS Space logo
     (Google Account > Personal info > Photo). Use the square logo, ideally the
     same mark as `public/favicon.png`.
   - Gmail shows this photo as the sender avatar to recipients once the From
     address is a Google-recognised account with a photo.
   - Also send our mail through Workspace DKIM (see Option B) so the From
     address is authenticated as `cdsspace.pro`.

2. **If we only have the personal `contact.cdsspace@gmail.com` + alias**:
   - Set the **profile photo on `contact.cdsspace@gmail.com`** to the CDS logo.
     Gmail often shows the underlying account's photo for alias sends to the
     same-org recipients, but this is inconsistent for external recipients and
     will never show the verified logo. Treat this as a stopgap and move to
     Option B for anything reliable.

Asset: export a square PNG of the logo, at least 256x256 (Google displays it in
a circle, so keep important detail centred). `public/favicon.png` is the source
of truth for the mark.

---

## Option B - Authenticate the domain (prerequisite for BIMI)

BIMI only displays if `cdsspace.pro` passes **SPF + DKIM aligned to the domain**
and has **DMARC at enforcement**. Our current "send as personal Gmail" path
fails DKIM alignment, so first switch `support@cdsspace.pro` onto a
domain-signed sender. Two practical routes:

### B1. Google Workspace (if support@cdsspace.pro is a Workspace user)
- In the Google **Admin console > Apps > Google Workspace > Gmail >
  Authenticate email**, generate the DKIM key for `cdsspace.pro` and publish the
  provided `google._domainkey` TXT record. Turn on signing.
- Ensure SPF TXT includes Google: `v=spf1 include:_spf.google.com ~all`.
- Send app mail through this account so DKIM is `d=cdsspace.pro`.

### B2. Resend (already supported in code, easiest for this app)
- In Resend, add and **verify the `cdsspace.pro` domain**. Resend gives you SPF,
  DKIM (`resend._domainkey`), and a return-path record to publish in DNS.
- Set `RESEND_API_KEY` in the environment. `createEmailTransport()` in
  `src/lib/email-from.ts` will then deliver over Resend's HTTPS API, DKIM-signed
  as `cdsspace.pro`.
- Keep `EMAIL_FROM=support@cdsspace.pro`.

### DMARC (required for BIMI, both routes)
Publish a DMARC record at `_dmarc.cdsspace.pro`, at enforcement (not `p=none`):

```
_dmarc.cdsspace.pro  TXT  "v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@cdsspace.pro; adkim=s; aspf=s"
```

Move to `p=reject` once you have confirmed all legitimate mail passes (watch the
`rua` aggregate reports for a week or two first).

---

## Option C - Full BIMI with the verified logo in Gmail

After Option B is live and DMARC is at `p=quarantine`/`reject`, add BIMI.

1. **Logo asset**: convert the CDS mark to **SVG Tiny 1.2 / SVG Portable-Secure
   (SVG P/S)** - square, solid background, no scripts/external refs. Tools:
   the "BIMI SVG converter" from BIMI Group, or an SVG editor exporting SVG-T.
   Host it over HTTPS, e.g. `https://cdsspace.pro/bimi/logo.svg`
   (drop it in `public/bimi/logo.svg`).

2. **BIMI DNS record** at `default._bimi.cdsspace.pro`:

   ```
   default._bimi.cdsspace.pro  TXT  "v=BIMI1; l=https://cdsspace.pro/bimi/logo.svg; a=https://cdsspace.pro/bimi/vmc.pem"
   ```

   The `l=` is the logo URL. The `a=` is the certificate (next step).

3. **Gmail requires a certificate** to actually render the logo. Either:
   - **VMC (Verified Mark Certificate)** - needs a **registered trademark** of the
     logo. Issued by DigiCert or Entrust. ~$1000+/year.
   - **CMC (Common Mark Certificate)** - newer, for logos **in use 12+ months**
     without a registered trademark. Also from DigiCert/Entrust, similar cost.

   The CA validates the logo/organisation and issues a `.pem` bundle; host it at
   the `a=` URL. Without a VMC/CMC, some clients (e.g. Apple Mail, Fastmail) may
   show the BIMI logo, but **Gmail will not**.

4. **Verify**: use the BIMI Group inspector or bimigroup.org tools to confirm the
   record, SVG, and certificate all validate. Allow time for propagation and for
   Gmail to pick up the change.

---

## Recommended path for us

1. Do **Option A** now (set the sender profile photo) to kill the grey
   placeholder immediately.
2. Move sending to **Option B2 (Resend, domain-verified)** since the code already
   supports it - this fixes DKIM alignment and is the cleanest fix.
3. Publish **DMARC** at enforcement.
4. Only pursue **Option C (BIMI + VMC/CMC)** if we want the verified logo/
   checkmark in Gmail and can justify the certificate cost. Steps 1-3 already
   give a branded, well-authenticated sender.

No application code changes are required for any of this except optionally
setting `RESEND_API_KEY` (Option B2), which the code already reads.
