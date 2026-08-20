import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery } from "@/lib/glashdb/postgres";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getAdminSessionAsync(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "super_admin" && !hasPermission(session.permissions, "legal")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const agreements = await glashQuery(
      `select agreement.id, agreement.user_id, profile.public_user_id,
              agreement.user_email, agreement.user_full_name, agreement.company_name,
              terms_version, terms_effective_date, privacy_version,
              privacy_effective_date, agreement_text, signed_at,
              ip_address, user_agent
         from public.user_legal_agreements agreement
         left join public.profiles profile on profile.id = agreement.user_id
        order by agreement.signed_at desc
        limit 500`,
    );
    let marketerAgreements: unknown[] = [];
    try {
      marketerAgreements = await glashQuery(
        `select agreement.id, agreement.marketer_user_id, marketer.public_id,
                marketer.marketer_code, agreement.signer_name, agreement.signer_email,
                agreement.terms_version, agreement.privacy_version,
                agreement.marketer_agreement_version, agreement.signed_at,
                agreement.ip_address
           from public.brand_marketer_agreements agreement
           left join public.brand_marketers marketer on marketer.user_id = agreement.marketer_user_id
          order by agreement.signed_at desc
          limit 500`,
      );
    } catch {
      // The legal page remains usable while the marketer migration is pending.
    }
    return NextResponse.json({ agreements, marketerAgreements });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load signed agreements.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
