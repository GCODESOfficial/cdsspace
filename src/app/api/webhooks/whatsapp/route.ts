import { NextResponse } from "next/server";
import { getIntegrationByMode } from "@/lib/whatsapp/config";
import { ingestInboundWhatsApp } from "@/lib/whatsapp/inbox";

export const dynamic = "force-dynamic";

// Meta webhook verification handshake.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const integ = await getIntegrationByMode("cloud_api");
  if (mode === "subscribe" && integ?.cloud_verify_token && token === integ.cloud_verify_token) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Meta webhook delivery. Meta retries on non-2xx, so we always 200 once persisted.
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const entries = payload?.entry ?? [];

    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        if (change?.field !== "messages") continue;
        const value = change?.value ?? {};
        const contacts = value?.contacts ?? [];
        const waName = contacts[0]?.profile?.name ?? null;

        for (const m of value?.messages ?? []) {
          const body =
            m?.text?.body ??
            m?.button?.text ??
            m?.interactive?.button_reply?.title ??
            m?.interactive?.list_reply?.title ??
            "";
          await ingestInboundWhatsApp({
            source: "whatsapp_cloud",
            fromPhone: m.from,
            waName,
            body,
            externalId: m.id,
            externalThreadId: value?.metadata?.phone_number_id ?? null,
            metadata: { type: m.type, raw: m },
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("whatsapp webhook error:", err);
    // Still respond 200 so Meta doesn't aggressively retry a malformed payload.
    return NextResponse.json({ ok: false });
  }
}
