import { redirect } from "next/navigation";
import { AgreementForm } from "@/components/auth/AgreementForm";
import {
  CLIENT_AGREEMENT_TEXT,
  getClientAccountState,
  getCurrentLegalAgreementDocuments,
  safeClientPath,
} from "@/lib/client-account";
import { createAgreementAuthorization } from "@/lib/client-agreement-authorization";
import { clientDashboardPath } from "@/lib/client-routes";

export const dynamic = "force-dynamic";

export default async function AgreementPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeClientPath(params.next);
  const account = await getClientAccountState();

  if (!account) redirect(`/login?next=${encodeURIComponent(`/agreement?next=${next}`)}`);
  if (account.agreement) {
    redirect(account.profile.billing_currency ? clientDashboardPath(account.profile.public_user_id, next) : `/onboarding?next=${encodeURIComponent(next)}`);
  }

  const documents = await getCurrentLegalAgreementDocuments();
  return (
    <AgreementForm
      next={clientDashboardPath(account.profile.public_user_id, next)}
      userId={account.profile.public_user_id}
      email={account.user.email || account.profile.email}
      fullName={account.profile.full_name || account.user.user_metadata?.full_name || ""}
      companyName={account.profile.company_name || ""}
      agreementText={CLIENT_AGREEMENT_TEXT}
      termsVersion={documents.terms.version}
      privacyVersion={documents.privacy.version}
      signingTime={new Date().toISOString()}
      authorizationToken={createAgreementAuthorization(account.user)}
    />
  );
}
