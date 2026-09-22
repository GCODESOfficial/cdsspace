import { NextResponse } from "next/server";
import { normalizeClientBillingCurrency } from "@/lib/client-billing";
import { readClientDashboardSession } from "@/lib/client-dashboard-session";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SavedProfile {
  full_name: string | null;
  company_name: string | null;
  phone_number: string | null;
  billing_currency: string | null;
  billing_currency_selected_at: string | null;
}

function cleanOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function retryableDatabaseError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code || "");
  return code.startsWith("08") || [
    "ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ECONNRESET", "EPIPE",
    "53300", "57P01", "57P02", "57P03",
  ].includes(code);
}

async function updateProfile(input: {
  userId: string;
  fullName: string;
  companyName: string | null;
  phoneNumber: string | null;
  billingCurrency: string;
}) {
  return glashMaybeOne<SavedProfile>(
    `update public.profiles
        set full_name = $2,
            company_name = $3,
            phone_number = $4,
            billing_currency = $5,
            billing_currency_selected_at = now(),
            updated_at = now()
      where id = $1::uuid
        and account_status = 'active'
      returning full_name, company_name, phone_number, billing_currency,
                billing_currency_selected_at`,
    [input.userId, input.fullName, input.companyName, input.phoneNumber, input.billingCurrency],
  );
}

export async function PATCH(request: Request) {
  const session = await readClientDashboardSession();
  if (!session) {
    return NextResponse.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const fullName = cleanOptionalText(body?.fullName, 160);
  const companyName = cleanOptionalText(body?.companyName, 200);
  const phoneNumber = cleanOptionalText(body?.phoneNumber, 60);
  const billingCurrency = normalizeClientBillingCurrency(body?.billingCurrency);

  if (!fullName || fullName.length < 2) {
    return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
  }
  if (!billingCurrency) {
    return NextResponse.json(
      { error: "Choose one of the supported billing currencies." },
      { status: 400 },
    );
  }

  const input = {
    userId: session.subject,
    fullName,
    companyName,
    phoneNumber,
    billingCurrency,
  };

  try {
    let profile: SavedProfile | null;
    try {
      profile = await updateProfile(input);
    } catch (error) {
      if (!retryableDatabaseError(error)) throw error;
      profile = await updateProfile(input);
    }

    if (!profile) {
      return NextResponse.json(
        { error: "This client account is not active and cannot be updated." },
        { status: 403 },
      );
    }

    return NextResponse.json({
      ok: true,
      profile: {
        fullName: profile.full_name || "",
        companyName: profile.company_name || "",
        phoneNumber: profile.phone_number || "",
        billingCurrency: profile.billing_currency,
        billingCurrencySelectedAt: profile.billing_currency_selected_at,
      },
    });
  } catch (error) {
    console.error("[client-profile] save failed", {
      code: String((error as { code?: unknown } | null)?.code || "unknown"),
      message: error instanceof Error ? error.message : "Unknown database error",
    });
    return NextResponse.json(
      { error: "The profile service is temporarily unavailable. Your changes remain on this page; please try again." },
      { status: 503 },
    );
  }
}
