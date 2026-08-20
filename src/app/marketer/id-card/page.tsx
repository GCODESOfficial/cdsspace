import { redirect } from "next/navigation";
import { MarketerIdCard } from "@/components/marketer/MarketerIdCard";
import { MarketerShell } from "@/components/marketer/MarketerShell";
import { getMarketerAccountState, marketerProfileComplete } from "@/lib/marketer-account";

export const dynamic = "force-dynamic";
export default async function MarketerIdCardPage() {
  const account = await getMarketerAccountState();
  if (!account) redirect("/marketer/login"); if (!account.agreement) redirect("/marketer/agreement"); if (!account.profile.billing_currency) redirect("/marketer/onboarding"); if (!marketerProfileComplete(account.profile)) redirect("/marketer/profile?setup=1");
  const name = account.profile.display_name || account.profile.full_name || "Brand Marketer";
  return <MarketerShell name={name} publicId={account.profile.public_id} code={account.profile.marketer_code}><header className="no-print mb-7"><p className="text-[12px] font-semibold text-[#075BE5]">Official identification</p><h1 className="mt-2 text-[32px] font-bold tracking-[-.03em]">Marketer ID card</h1><p className="mt-2 text-[13px] text-[#667085]">Print a physical copy or save a PDF. The CDS Space mark and current account status are included.</p></header><MarketerIdCard name={name} publicId={account.profile.public_id} code={account.profile.marketer_code!} country={account.profile.country!} photoUrl={account.profile.profile_photo_url} activeSince={account.profile.profile_completed_at || new Date().toISOString()} /></MarketerShell>;
}
