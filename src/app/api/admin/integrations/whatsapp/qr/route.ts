import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { stopQrClient } from "@/lib/whatsapp/qr-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("whatsapp_integrations")
    .select("qr_code, qr_status, qr_linked_phone, qr_last_seen_at, qr_error")
    .eq("mode", "web_qr")
    .maybeSingle();

  // Stale: if last heartbeat > 90s ago and we had been connected, treat as disconnected.
  let bridgeAlive = false;
  if (data?.qr_last_seen_at) {
    bridgeAlive = Date.now() - new Date(data.qr_last_seen_at).getTime() < 90_000;
  }

  return NextResponse.json({ ...data, bridgeAlive });
}

// Reset: tear down the in-process client and wipe stored QR/linked phone so a
// subsequent /qr/start publishes a fresh pairing QR.
export async function DELETE() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await stopQrClient().catch(() => {});

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("whatsapp_integrations")
    .update({
      qr_code: null,
      qr_status: "disconnected",
      qr_linked_phone: null,
      qr_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("mode", "web_qr");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
