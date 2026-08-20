import { redirect } from "next/navigation";
import { MarketerCurrencyForm } from "@/components/marketer/MarketerCurrencyForm";
import { getMarketerAccountState } from "@/lib/marketer-account";

export const dynamic = "force-dynamic";
export default async function MarketerOnboardingPage() {
  const account = await getMarketerAccountState();
  if (!account) redirect("/marketer/login");
  if (!account.agreement) redirect("/marketer/agreement");
  if (account.profile.billing_currency) redirect("/marketer/profile?setup=1");
  return <MarketerCurrencyForm initialCurrency={account.profile.billing_currency} />;
}
