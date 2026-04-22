/**
 * In-process WhatsApp Web QR client. Keeps a single whatsapp-web.js Client alive
 * at module scope so the Activate button can immediately request a QR and the
 * same process can send/receive messages.
 *
 * NOT SAFE on Vercel serverless (functions are recycled). For production with
 * a persistent host (Railway, Fly, Docker, VPS) this works. On Vercel, deploy
 * the separate `whatsapp-bridge/` workspace instead and this module is unused.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalisePhone, waRoomIdFromPhone } from "./config";

type ClientStatus = "idle" | "initializing" | "pairing" | "connected" | "error";

interface Runtime {
  client: any | null;
  status: ClientStatus;
  initPromise: Promise<void> | null;
}

const SESSION_ID = "cds-web";

// Module-scoped singleton. Survives across requests within one Node process.
const g = globalThis as unknown as { __cdsWaRuntime?: Runtime };
if (!g.__cdsWaRuntime) {
  g.__cdsWaRuntime = { client: null, status: "idle", initPromise: null };
}
const runtime = g.__cdsWaRuntime;

async function setIntegrationFields(fields: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("whatsapp_integrations")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("mode", "web_qr");
}

async function ingestInbound(msg: {
  fromPhone: string;
  waName: string | null;
  body: string;
  externalId: string;
  mediaUrl: string | null;
  metadata: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  const phone = normalisePhone(msg.fromPhone);
  const roomId = waRoomIdFromPhone(phone);

  const { data: existing } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("source", "whatsapp_qr")
    .eq("external_id", msg.externalId)
    .maybeSingle();
  if (existing?.id) return;

  await supabase.from("whatsapp_contacts").upsert(
    {
      phone,
      wa_name: msg.waName,
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

  await supabase.from("chat_messages").insert({
    room_id: roomId,
    sender_id: contact?.client_id ?? null,
    sender_role: "client",
    message: msg.body || "",
    file_url: msg.mediaUrl,
    source: "whatsapp_qr",
    external_id: msg.externalId,
    external_metadata: msg.metadata,
  });

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", "ceo@cdsspace.pro")
    .maybeSingle();
  if (adminProfile?.id) {
    await supabase.from("notifications").insert({
      user_id: adminProfile.id,
      type: "new_message",
      title: `WhatsApp · ${msg.waName || phone}`,
      message: msg.body.length > 100 ? msg.body.slice(0, 100) + "..." : msg.body,
      link: `/admin/messages?room=${encodeURIComponent(roomId)}`,
    });
  }
}

export function getQrStatus(): ClientStatus {
  return runtime.status;
}

/**
 * Idempotent. First call spins up the WhatsApp client and wires handlers.
 * Subsequent calls resolve immediately while the client keeps running.
 */
export async function ensureQrClientStarted(): Promise<void> {
  if (runtime.client && runtime.status !== "idle" && runtime.status !== "error") return;
  if (runtime.initPromise) return runtime.initPromise;

  runtime.initPromise = (async () => {
    runtime.status = "initializing";
    await setIntegrationFields({
      qr_session_id: SESSION_ID,
      qr_status: "pairing",
      qr_error: null,
      qr_linked_phone: null,
    });

    // Dynamic import so the Next.js build doesn't fail if puppeteer's optional
    // native bits are missing; the import only runs when Activate is clicked.
    const wweb = await import("whatsapp-web.js");
    const QRCode = await import("qrcode");
    const { Client, LocalAuth } = wweb as any;

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: SESSION_ID, dataPath: "./.wwebjs_auth" }),
      puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
    });

    client.on("qr", async (qr: string) => {
      try {
        const dataUrl = await (QRCode as any).toDataURL(qr, { margin: 1, width: 320 });
        runtime.status = "pairing";
        await setIntegrationFields({
          qr_code: dataUrl,
          qr_status: "pairing",
          qr_error: null,
          qr_linked_phone: null,
        });
      } catch (err) {
        console.error("[wa-qr] QR publish failed", err);
      }
    });

    client.on("ready", async () => {
      const me = client.info?.wid?.user || null;
      runtime.status = "connected";
      await setIntegrationFields({
        qr_code: null,
        qr_status: "connected",
        qr_linked_phone: me,
        qr_last_seen_at: new Date().toISOString(),
        qr_error: null,
      });
      console.log(`[wa-qr] linked as ${me}`);
    });

    client.on("auth_failure", async (msg: string) => {
      runtime.status = "error";
      await setIntegrationFields({ qr_status: "error", qr_error: String(msg) });
    });

    client.on("disconnected", async (reason: string) => {
      runtime.status = "idle";
      runtime.client = null;
      await setIntegrationFields({ qr_status: "disconnected", qr_error: String(reason) });
    });

    client.on("message", async (msg: any) => {
      if (msg.fromMe) return;
      if (msg.from?.endsWith?.("@g.us") || msg.from === "status@broadcast") return;
      const contact = await msg.getContact().catch(() => null);
      const phone = msg.from?.replace?.(/@.*/, "") || "";
      let body = msg.body || "";
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media) body = body || `[${media.mimetype} attachment]`;
        } catch {}
      }
      await ingestInbound({
        fromPhone: phone,
        waName: contact?.pushname || contact?.name || null,
        body,
        externalId: msg.id?._serialized || `${msg.from}:${msg.timestamp}`,
        mediaUrl: null,
        metadata: { type: msg.type, timestamp: msg.timestamp },
      });
    });

    // Heartbeat.
    setInterval(() => {
      setIntegrationFields({ qr_last_seen_at: new Date().toISOString() }).catch(() => {});
    }, 30_000).unref?.();

    runtime.client = client;
    client.initialize();
  })();

  try {
    await runtime.initPromise;
  } catch (err) {
    runtime.status = "error";
    runtime.initPromise = null;
    await setIntegrationFields({
      qr_status: "error",
      qr_error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function sendQrMessage(phone: string, body: string): Promise<string | null> {
  if (!runtime.client || runtime.status !== "connected") {
    throw new Error("WhatsApp Web client is not connected");
  }
  const jid = `${normalisePhone(phone)}@c.us`;
  const sent = await runtime.client.sendMessage(jid, body);
  return sent?.id?._serialized || null;
}

export function isQrConnected(): boolean {
  return runtime.status === "connected" && !!runtime.client;
}

export async function stopQrClient() {
  if (runtime.client) {
    try {
      await runtime.client.destroy();
    } catch {}
  }
  runtime.client = null;
  runtime.status = "idle";
  runtime.initPromise = null;
  await setIntegrationFields({
    qr_code: null,
    qr_status: "disconnected",
    qr_linked_phone: null,
    qr_error: null,
  });
}
