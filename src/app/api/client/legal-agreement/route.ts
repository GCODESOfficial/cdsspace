import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/glashdb/server";
import { verifyAgreementAuthorization } from "@/lib/client-agreement-authorization";
import {
  readClientDashboardSessionUser,
  setClientDashboardSessionOnResponse,
} from "@/lib/client-dashboard-session";
import {
  CLIENT_AGREEMENT_TEXT,
  ensureClientProfile,
  getCurrentLegalAgreementDocuments,
  safeClientPath,
} from "@/lib/client-account";
import { clientDashboardPath } from "@/lib/client-routes";

export const dynamic = "force-dynamic";

async function authenticatedUser(authorizationToken?: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any;
  const sessionUser = await readClientDashboardSessionUser(db.auth);
  const authorization = verifyAgreementAuthorization(authorizationToken);

  // A token supplied alongside a live session must describe that same user.
  if (sessionUser) {
    if (authorization && authorization.subject !== sessionUser.id) {
      return { db, user: null, forbidden: true };
    }
    return { db, user: sessionUser, forbidden: false };
  }

  // The agreement page minted this short-lived proof only after authenticating
  // the user. It safely bridges a cookie-refresh race for this one operation.
  if (authorization) {
    const user = {
      id: authorization.subject,
      email: authorization.email,
      user_metadata: {},
    } as User;
    return { db, user, forbidden: false };
  }

  return { db, user: null, forbidden: false };
}

export async function GET() {
  const { db, user } = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile, documents, agreementResult] = await Promise.all([
    ensureClientProfile(user),
    getCurrentLegalAgreementDocuments(),
    db.from("user_legal_agreements").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile,
    agreement: agreementResult.data || null,
    documents: {
      terms: { version: documents.terms.version, effectiveDate: documents.terms.effective_date },
      privacy: { version: documents.privacy.version, effectiveDate: documents.privacy.effective_date },
    },
    agreementText: CLIENT_AGREEMENT_TEXT,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { db, user, forbidden } = await authenticatedUser(body?.authorizationToken);
  if (forbidden) return NextResponse.json({ error: "This agreement does not belong to the active account." }, { status: 403 });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!body?.accepted) {
    return NextResponse.json({ error: "You must accept the Terms of Service and Privacy Policy." }, { status: 400 });
  }

  const profile = await ensureClientProfile(user);

  const { data: existing } = await db
    .from("user_legal_agreements")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // Acceptance is deliberately one-time and immutable from the client UI.
  if (existing) {
    return setClientDashboardSessionOnResponse(
      NextResponse.json({ agreement: existing, next: clientDashboardPath(profile.public_user_id, safeClientPath(body.next)) }),
      user,
    );
  }

  const signerName = String(body.signerName || profile.full_name || "").trim();
  if (signerName.length < 2) {
    return NextResponse.json({ error: "Enter your full name to sign the agreement." }, { status: 400 });
  }

  const { terms, privacy } = await getCurrentLegalAgreementDocuments();
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const realIp = req.headers.get("x-real-ip") || null;

  const payload = {
    user_id: user.id,
    user_email: user.email || profile.email,
    user_full_name: signerName,
    company_name: profile.company_name,
    terms_version: terms.version,
    terms_effective_date: terms.effective_date,
    privacy_version: privacy.version,
    privacy_effective_date: privacy.effective_date,
    agreement_text: CLIENT_AGREEMENT_TEXT,
    signed_at: new Date().toISOString(),
    ip_address: forwardedFor || realIp,
    user_agent: req.headers.get("user-agent"),
  };

  const { data, error } = await db
    .from("user_legal_agreements")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Could not record the agreement." }, { status: 500 });
  }

  return setClientDashboardSessionOnResponse(
    NextResponse.json({ agreement: data, next: clientDashboardPath(profile.public_user_id, safeClientPath(body.next)) }),
    user,
  );
}
