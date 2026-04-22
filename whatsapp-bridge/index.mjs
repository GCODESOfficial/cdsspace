#!/usr/bin/env node
// WhatsApp Web QR bridge for CDS Space.
// Run this on a persistent host (a small VPS, Railway, Fly, or a laptop) — NOT on Vercel.
// It reads outbound messages from `whatsapp_outbox` and writes inbound messages into
// `chat_messages` with source='whatsapp_qr'.
//
// Env:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   BRIDGE_POLL_MS            (optional, default 2000)
//   BRIDGE_HEARTBEAT_MS       (optional, default 30000)

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import pkg from "whatsapp-web.js";
import QRCode from "qrcode";

const { Client, LocalAuth } = pkg;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_MS = Number(process.env.BRIDGE_POLL_MS || 2000);
const HEARTBEAT_MS = Number(process.env.BRIDGE_HEARTBEAT_MS || 30000);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const normalisePhone = (raw) => String(raw || "").replace(/[^\d]/g, "");
const waRoomIdFromPhone = (p) => `whatsapp_${normalisePhone(p)}`;
const SESSION_ID = "cds-bridge";

async function setIntegrationFields(fields) {
  const { error } = await supabase
    .from("whatsapp_integrations")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("mode", "web_qr");
  if (error) console.error("[bridge] update integration failed:", error.message);
}

async function ingestInbound({ fromPhone, waName, body, externalId, mediaUrl, metadata }) {
  const phone = normalisePhone(fromPhone);
  const roomId = waRoomIdFromPhone(phone);

  const { data: existing } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("source", "whatsapp_qr")
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing?.id) return;

  await supabase.from("whatsapp_contacts").upsert(
    {
      phone,
      wa_name: waName || null,
      last_inbound_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "phone" },
  );

  const { data: contact } = await supabase
    .from("whatsapp_contacts")
    .select("client_id")
    .eq("phone", phone)
    .maybeSingle();

  const { error } = await supabase.from("chat_messages").insert({
    room_id: roomId,
    sender_id: contact?.client_id ?? null,
    sender_role: "client",
    message: body || "",
    file_url: mediaUrl || null,
    source: "whatsapp_qr",
    external_id: externalId,
    external_metadata: metadata || null,
  });
  if (error) {
    console.error("[bridge] insert inbound failed:", error.message);
    return;
  }

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", "ceo@cdsspace.pro")
    .maybeSingle();
  if (adminProfile?.id) {
    await supabase.from("notifications").insert({
      user_id: adminProfile.id,
      type: "new_message",
      title: `WhatsApp · ${waName || phone}`,
      message: body.length > 100 ? body.slice(0, 100) + "..." : body,
      link: `/admin/messages?room=${encodeURIComponent(roomId)}`,
    });
  }
}

const client = new Client({
  authStrategy: new LocalAuth({ clientId: SESSION_ID, dataPath: "./.wwebjs_auth" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", async (qr) => {
  console.log("[bridge] QR received — publishing to Supabase");
  try {
    const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
    await setIntegrationFields({
      qr_session_id: SESSION_ID,
      qr_code: dataUrl,
      qr_status: "pairing",
      qr_error: null,
      qr_linked_phone: null,
    });
  } catch (err) {
    console.error("[bridge] QR publish failed:", err);
  }
});

client.on("ready", async () => {
  const me = client.info?.wid?.user || null;
  console.log(`[bridge] ready — linked as ${me}`);
  await setIntegrationFields({
    qr_code: null,
    qr_status: "connected",
    qr_linked_phone: me,
    qr_last_seen_at: new Date().toISOString(),
    qr_error: null,
  });
});

client.on("authenticated", () => console.log("[bridge] authenticated"));

client.on("auth_failure", async (msg) => {
  console.error("[bridge] auth failure:", msg);
  await setIntegrationFields({ qr_status: "error", qr_error: String(msg) });
});

client.on("disconnected", async (reason) => {
  console.warn("[bridge] disconnected:", reason);
  await setIntegrationFields({ qr_status: "disconnected", qr_error: String(reason) });
});

client.on("message", async (msg) => {
  if (msg.fromMe) return;
  const contact = await msg.getContact().catch(() => null);
  const phone = msg.from.replace(/@.*/, "");
  let mediaUrl = null;
  let body = msg.body || "";

  // Skip status broadcasts and groups for now — 1:1 client chats only.
  if (msg.from.endsWith("@g.us") || msg.from === "status@broadcast") return;

  if (msg.hasMedia) {
    try {
      const media = await msg.downloadMedia();
      // NOTE: for production, upload media.data (base64) to storage and store the URL.
      // For now we drop a marker so the admin knows an attachment is pending.
      if (media) body = body || `[${media.mimetype} attachment]`;
    } catch (e) {
      console.warn("[bridge] media download failed", e);
    }
  }

  await ingestInbound({
    fromPhone: phone,
    waName: contact?.pushname || contact?.name || null,
    body,
    externalId: msg.id?._serialized || `${msg.from}:${msg.timestamp}`,
    mediaUrl,
    metadata: { type: msg.type, timestamp: msg.timestamp },
  });
});

async function processOutbox() {
  const { data: rows } = await supabase
    .from("whatsapp_outbox")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  for (const row of rows || []) {
    const to = normalisePhone(row.to_phone);
    const jid = `${to}@c.us`;
    try {
      const sent = await client.sendMessage(jid, row.body || "");
      const serialised = sent?.id?._serialized || null;
      await supabase
        .from("whatsapp_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts: (row.attempts || 0) + 1,
          error: null,
        })
        .eq("id", row.id);
      if (row.chat_message_id && serialised) {
        await supabase
          .from("chat_messages")
          .update({ external_id: serialised })
          .eq("id", row.chat_message_id);
      }
    } catch (err) {
      const attempts = (row.attempts || 0) + 1;
      const failed = attempts >= 3;
      await supabase
        .from("whatsapp_outbox")
        .update({
          status: failed ? "failed" : "pending",
          attempts,
          error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", row.id);
    }
  }
}

async function heartbeat() {
  await setIntegrationFields({ qr_last_seen_at: new Date().toISOString() });
}

async function main() {
  console.log("[bridge] initialising client…");
  await setIntegrationFields({
    qr_session_id: SESSION_ID,
    qr_status: "pairing",
    qr_error: null,
  });
  client.initialize();

  setInterval(() => {
    processOutbox().catch((e) => console.error("[bridge] outbox err", e));
  }, POLL_MS);
  setInterval(() => {
    heartbeat().catch(() => {});
  }, HEARTBEAT_MS);
}

main().catch((err) => {
  console.error("[bridge] fatal:", err);
  process.exit(1);
});
