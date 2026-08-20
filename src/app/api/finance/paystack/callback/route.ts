import { NextRequest, NextResponse } from "next/server";
import { finalizePaystackInvoicePayment } from "@/lib/paystack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference")?.trim() || "";
  const token = request.nextUrl.searchParams.get("invoice")?.trim() || "";
  const target = new URL(`/invoice/${encodeURIComponent(token)}`, request.nextUrl.origin);
  try {
    if (!reference || !token) throw new Error("Missing payment reference.");
    const result = await finalizePaystackInvoicePayment(reference);
    if (!result || result.public_token !== token) throw new Error("Invoice payment could not be matched.");
    target.searchParams.set("payment", "success");
  } catch {
    target.searchParams.set("payment", "failed");
  }
  return NextResponse.redirect(target);
}
