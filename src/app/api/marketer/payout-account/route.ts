import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/glashdb/server";
import { getVerifiedAuthUser } from "@/lib/glashdb/auth-user";
import { isClientBillingCurrency } from "@/lib/client-billing";

export async function PUT(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any;
  const user = await getVerifiedAuthUser(db.auth);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const accountType = body.accountType === "mobile_money" ? "mobile_money" : "bank";
  const accountName = String(body.accountName || "").trim();
  const bankName = String(body.bankName || "").trim();
  const accountNumber = String(body.accountNumber || "").trim();
  const currency = String(body.currency || "").toUpperCase();
  if (!accountName || !bankName || !accountNumber) return NextResponse.json({ error: "Complete the account name, provider and account number." }, { status: 400 });
  if (!isClientBillingCurrency(currency)) return NextResponse.json({ error: "Unsupported payout currency." }, { status: 400 });
  const payload = { marketer_user_id: user.id, account_type: accountType, account_name: accountName, bank_name: bankName, account_number: accountNumber, bank_code: String(body.bankCode || "").trim() || null, country: String(body.country || "").trim() || null, currency, updated_at: new Date().toISOString(), verified_at: null };
  const { data, error } = await db.from("brand_marketer_payout_accounts").upsert(payload, { onConflict: "marketer_user_id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payoutAccount: data });
}
