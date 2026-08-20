import { NextRequest, NextResponse } from "next/server";
import { finalizePaystackCardSetup, finalizePaystackInvoicePayment, verifyPaystackWebhook } from "@/lib/paystack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyPaystackWebhook(rawBody, request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as { event?: string; data?: { reference?: string } };
  if (event.event === "charge.success" && event.data?.reference) {
    try {
      if (event.data.reference.startsWith("CDSINV-")) await finalizePaystackInvoicePayment(event.data.reference, event.data);
      else await finalizePaystackCardSetup(event.data.reference, event.data);
    } catch (error) {
      console.error("[paystack] card setup webhook could not be finalized", error instanceof Error ? error.message : "Unknown error");
    }
  }

  return NextResponse.json({ ok: true });
}
