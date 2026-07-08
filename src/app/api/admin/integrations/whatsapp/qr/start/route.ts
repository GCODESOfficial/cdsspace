import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { ensureQrClientStarted, getQrStatus } from "@/lib/whatsapp/qr-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST - starts (or attaches to) the in-process WhatsApp Web client.
// Returns immediately; the QR itself is published to whatsapp_integrations.qr_code
// by the runtime as soon as whatsapp-web.js emits the 'qr' event. The admin page
// polls /api/admin/integrations/whatsapp/qr to display it.
export async function POST() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Don't await - let the client spin up in the background so the request returns fast.
    // Any pairing/connection state is written to the DB by the runtime.
    ensureQrClientStarted().catch((err) => {
      console.error("[qr/start] runtime failed:", err);
    });
    return NextResponse.json({ ok: true, status: getQrStatus() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
