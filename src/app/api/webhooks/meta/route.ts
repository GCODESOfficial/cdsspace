import { NextResponse } from "next/server";
import { getMetaIntegration } from "@/lib/meta/config";
import { ingestMetaMessage } from "@/lib/meta/inbox";

export const dynamic = "force-dynamic";

// Meta webhook verification — matches the verify_token stored on either platform row.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const [fb, ig] = await Promise.all([
    getMetaIntegration("facebook"),
    getMetaIntegration("instagram"),
  ]);

  const valid =
    mode === "subscribe" &&
    token &&
    ((fb?.verify_token && token === fb.verify_token) ||
      (ig?.verify_token && token === ig.verify_token));
  if (valid) return new Response(challenge ?? "", { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

// Meta webhook delivery for Page (Messenger) and Instagram messaging.
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const object = payload?.object as string | undefined;
    const entries = payload?.entry ?? [];

    for (const entry of entries) {
      // Messenger Page subscription: entry.messaging[]
      if (object === "page") {
        const pageId = entry?.id as string | undefined;
        for (const ev of entry?.messaging ?? []) {
          if (!ev?.message) continue;
          const senderId = ev.sender?.id;
          if (!senderId || senderId === pageId) continue;
          const text = ev.message?.text || "";
          const attachments = ev.message?.attachments || [];
          await ingestMetaMessage({
            platform: "facebook",
            externalUserId: senderId,
            body: text,
            externalId: ev.message.mid,
            externalThreadId: null,
            createdAtIso: new Date(ev.timestamp || Date.now()).toISOString(),
            fromPage: false,
            mediaUrl: attachments[0]?.payload?.url ?? null,
            metadata: { raw: ev },
          });
        }
      }

      // Instagram subscription: entry.messaging[] with senders as IGSIDs
      if (object === "instagram") {
        const igId = entry?.id as string | undefined;
        for (const ev of entry?.messaging ?? []) {
          if (!ev?.message) continue;
          const senderId = ev.sender?.id;
          if (!senderId || senderId === igId) continue;
          await ingestMetaMessage({
            platform: "instagram",
            externalUserId: senderId,
            body: ev.message?.text || "",
            externalId: ev.message.mid,
            externalThreadId: null,
            createdAtIso: new Date(ev.timestamp || Date.now()).toISOString(),
            fromPage: false,
            mediaUrl: ev.message?.attachments?.[0]?.payload?.url ?? null,
            metadata: { raw: ev },
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("meta webhook error:", err);
    return NextResponse.json({ ok: false });
  }
}
