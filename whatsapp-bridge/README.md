# CDS WhatsApp QR Bridge

Long-running Node process that links your WhatsApp Business number via the WhatsApp Web QR scan and bridges messages between WhatsApp and the CDS Space Supabase database.

> This process cannot run on Vercel (serverless). Run it on a small VPS, a Raspberry Pi, Railway, Fly.io, or a spare laptop.

## Setup

1. `cd whatsapp-bridge && npm install`
2. Copy the main app's `.env` here (or symlink) — the bridge needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. In the admin portal, go to **/admin/integrations/whatsapp** and switch the mode to **Web QR**.
4. `npm start`
5. Open **/admin/integrations/whatsapp** — the QR code will appear. Open WhatsApp on your phone → Linked devices → Link a device → scan.
6. Status will flip to **Connected** once pairing succeeds.

## Caveats

- Uses reverse-engineered WhatsApp Web protocol (whatsapp-web.js). Against WhatsApp ToS; numbers can get banned.
- Auth is persisted in `./.wwebjs_auth` — keep that folder safe and back it up; losing it means re-pairing.
- Only 1:1 messages are bridged — group and status messages are dropped.
- Media handling is a stub. The bridge writes a placeholder `[mime/type attachment]` body; wire up Supabase Storage before relying on it.
