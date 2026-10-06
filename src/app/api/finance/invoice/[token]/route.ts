import { NextRequest, NextResponse } from "next/server";
import { loadPublicInvoice } from "@/lib/finance/public-invoice";

/** Public invoice lookup by public token or invoice number (see loadPublicInvoice). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadPublicInvoice(token);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}
