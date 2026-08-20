import { redirect } from "next/navigation";
import { MarketerAgreementForm } from "@/components/marketer/MarketerAgreementForm";
import { getCurrentMarketerLegalDocuments, getMarketerAccountState } from "@/lib/marketer-account";

export const dynamic = "force-dynamic";
export default async function MarketerAgreementPage() {
  const account = await getMarketerAccountState();
  if (!account) redirect("/marketer/login");
  if (account.agreement) redirect(account.profile.billing_currency ? "/marketer/profile?setup=1" : "/marketer/onboarding");
  const docs = await getCurrentMarketerLegalDocuments();
  return <MarketerAgreementForm publicId={account.profile.public_id} email={account.profile.email} fullName={account.profile.full_name || ""} signingTime={new Date().toISOString()} termsVersion={docs.terms.version} privacyVersion={docs.privacy.version} agreementVersion={docs.marketerAgreement.version} />;
}
