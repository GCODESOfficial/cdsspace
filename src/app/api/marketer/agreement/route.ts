import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/glashdb/server";
import { getVerifiedAuthUser } from "@/lib/glashdb/auth-user";
import { ensureMarketerProfile, getCurrentMarketerLegalDocuments, MARKETER_AGREEMENT_TEXT } from "@/lib/marketer-account";

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any;
  const user = await getVerifiedAuthUser(db.auth);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.accepted) return NextResponse.json({ error: "Accept all three documents to continue." }, { status: 400 });
  const profile = await ensureMarketerProfile(user);
  const signerName = String(body.signerName || "").trim();
  if (signerName.length < 2) return NextResponse.json({ error: "Enter your full legal name." }, { status: 400 });
  const { data: existing } = await db.from("brand_marketer_agreements").select("*").eq("marketer_user_id", user.id).maybeSingle();
  if (existing) return NextResponse.json({ agreement: existing, next: profile.billing_currency ? "/marketer/profile?setup=1" : "/marketer/onboarding" });
  const docs = await getCurrentMarketerLegalDocuments();
  const payload = {
    marketer_user_id: user.id, signer_name: signerName, signer_email: profile.email,
    terms_version: docs.terms.version, terms_effective_date: docs.terms.effective_date,
    privacy_version: docs.privacy.version, privacy_effective_date: docs.privacy.effective_date,
    marketer_agreement_version: docs.marketerAgreement.version,
    marketer_agreement_effective_date: docs.marketerAgreement.effective_date,
    agreement_text: MARKETER_AGREEMENT_TEXT, signed_at: new Date().toISOString(),
    ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip"),
    user_agent: req.headers.get("user-agent"),
  };
  const { data, error } = await db.from("brand_marketer_agreements").insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db.from("brand_marketers").update({ full_name: signerName, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  return NextResponse.json({ agreement: data, next: "/marketer/onboarding" });
}
