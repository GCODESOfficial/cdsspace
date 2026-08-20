import { redirect } from "next/navigation";
import { MarketerProfileForm } from "@/components/marketer/MarketerProfileForm";
import { MarketerShell } from "@/components/marketer/MarketerShell";
import { getMarketerAccountState } from "@/lib/marketer-account";

export const dynamic = "force-dynamic";
export default async function MarketerProfilePage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const account = await getMarketerAccountState();
  if (!account) redirect("/marketer/login");
  if (!account.agreement) redirect("/marketer/agreement");
  if (!account.profile.billing_currency) redirect("/marketer/onboarding");
  const setup = (await searchParams).setup === "1";
  return <MarketerShell name={account.profile.display_name || account.profile.full_name || "Brand Marketer"} publicId={account.profile.public_id} code={account.profile.marketer_code}><MarketerProfileForm profile={account.profile} payoutAccount={account.payoutAccount} setup={setup} /></MarketerShell>;
}
