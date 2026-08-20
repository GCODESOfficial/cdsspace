import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/glashdb/server";
import { getVerifiedAuthUser } from "@/lib/glashdb/auth-user";
import { isClientBillingCurrency } from "@/lib/client-billing";

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any;
  const user = await getVerifiedAuthUser(db.auth);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const currency = String(body.currency || "").toUpperCase();
  if (!isClientBillingCurrency(currency)) return NextResponse.json({ error: "Choose a supported currency." }, { status: 400 });
  const { error } = await db.from("brand_marketers").update({ billing_currency: currency, billing_currency_selected_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, next: "/marketer/profile?setup=1" });
}
