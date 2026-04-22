import type { WhatsAppIntegration } from "./config";
import { normalisePhone } from "./config";

const GRAPH_VERSION = "v21.0";

export async function sendCloudApiMessage(
  integ: WhatsAppIntegration,
  toPhone: string,
  body: string,
): Promise<{ ok: true; externalId: string } | { ok: false; error: string }> {
  if (!integ.cloud_phone_number_id || !integ.cloud_access_token) {
    return { ok: false, error: "Cloud API credentials not configured" };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${integ.cloud_phone_number_id}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integ.cloud_access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalisePhone(toPhone),
        type: "text",
        text: { body, preview_url: false },
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
    }
    const externalId = json?.messages?.[0]?.id;
    if (!externalId) return { ok: false, error: "No message id in response" };
    return { ok: true, externalId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
