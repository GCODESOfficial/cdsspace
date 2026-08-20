import { NextRequest, NextResponse } from "next/server";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { clientDashboardPath } from "@/lib/client-routes";
import { finalizePaystackCardSetup } from "@/lib/paystack";

export const dynamic = "force-dynamic";

interface OwnerRow {
  user_id: string;
  public_user_id: string | null;
}

function settingsUrl(request: NextRequest, publicUserId: string | null, state: string) {
  const path = publicUserId
    ? clientDashboardPath(publicUserId, "/dashboard/settings")
    : "/dashboard/settings";
  const url = new URL(path, request.nextUrl.origin);
  url.searchParams.set("payment", state);
  return url;
}

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference")?.trim() || "";
  if (!reference) return NextResponse.redirect(settingsUrl(request, null, "failed"));

  const owner = await glashMaybeOne<OwnerRow>(
    `select setup.user_id, profile.public_user_id
       from public.client_payment_setup_sessions setup
       left join public.profiles profile on profile.id = setup.user_id
      where setup.reference = $1
      limit 1`,
    [reference],
  );
  if (!owner) return NextResponse.redirect(settingsUrl(request, null, "failed"));

  try {
    const method = await finalizePaystackCardSetup(reference);
    return NextResponse.redirect(settingsUrl(request, owner.public_user_id, method ? "success" : "failed"));
  } catch {
    return NextResponse.redirect(settingsUrl(request, owner.public_user_id, "failed"));
  }
}
