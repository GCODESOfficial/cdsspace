import { redirect } from "next/navigation";
import { CurrencyOnboardingForm } from "@/components/auth/CurrencyOnboardingForm";
import { getClientAccountState, safeClientPath } from "@/lib/client-account";
import { clientDashboardPath } from "@/lib/client-routes";

export const dynamic = "force-dynamic";

export default async function ClientOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeClientPath(params.next);
  const account = await getClientAccountState();

  if (!account) redirect(`/login?next=${encodeURIComponent(`/onboarding?next=${next}`)}`);
  if (!account.agreement) redirect(`/agreement?next=${encodeURIComponent(next)}`);
  if (account.profile.billing_currency) redirect(clientDashboardPath(account.profile.public_user_id, next));

  return (
    <CurrencyOnboardingForm
      next={clientDashboardPath(account.profile.public_user_id, next)}
      userId={account.profile.public_user_id}
      accountName={account.profile.full_name || account.profile.company_name || account.user.email || "Client account"}
      initialCurrency={account.profile.billing_currency}
    />
  );
}
