import { NextRequest, NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { clientDashboardPath } from "@/lib/client-routes";
import {
  createPaymentSetupSession,
  failPaymentSetupSession,
  getPaystackCardSetupConfig,
  getPaystackStatus,
  newPaystackReference,
  paystackRequest,
} from "@/lib/paystack";
import { applicationOrigin } from "@/lib/public-site";

export const dynamic = "force-dynamic";

function siteOrigin(request: NextRequest) {
  return applicationOrigin(request);
}

export async function POST(request: NextRequest) {
  const account = await getClientAccountState();
  if (!account?.agreement) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const paystack = getPaystackStatus();
  if (!paystack.configured) {
    return NextResponse.json(
      { error: "Paystack is not configured yet. Add PAYSTACK_SECRET_KEY to enable secure card setup." },
      { status: 503 },
    );
  }

  const email = (account.user.email || account.profile.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "A verified account email is required." }, { status: 400 });

  const reference = newPaystackReference();
  const { amount, currency } = getPaystackCardSetupConfig();
  await createPaymentSetupSession({ userId: account.user.id, reference, email, amount, currency });

  try {
    const returnPath = clientDashboardPath(account.profile.public_user_id, "/dashboard/settings");
    const payload = await paystackRequest<{
      data?: { authorization_url?: string; access_code?: string; reference?: string };
    }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email,
        amount: String(amount),
        currency,
        reference,
        channels: ["card"],
        callback_url: `${siteOrigin(request)}/api/client/payments/paystack/callback`,
        metadata: JSON.stringify({
          purpose: "card_setup",
          client_user_id: account.user.id,
          cancel_action: `${siteOrigin(request)}${returnPath}?payment=cancelled`,
        }),
      }),
    });

    const authorizationUrl = payload.data?.authorization_url || "";
    const checkout = new URL(authorizationUrl);
    if (checkout.protocol !== "https:" || !(checkout.hostname === "paystack.com" || checkout.hostname.endsWith(".paystack.com"))) {
      throw new Error("Paystack returned an invalid checkout URL.");
    }

    return NextResponse.json({
      ok: true,
      authorization_url: authorizationUrl,
      reference,
      amount,
      currency,
      mode: paystack.mode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start secure card setup.";
    await failPaymentSetupSession(reference, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
