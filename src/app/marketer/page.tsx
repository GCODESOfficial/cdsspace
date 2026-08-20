import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BadgeCheck, BadgePercent, CreditCard, IdCard, ReceiptText, UsersRound } from "lucide-react";
import { MarketerShell } from "@/components/marketer/MarketerShell";
import { createClient } from "@/lib/glashdb/server";
import { getMarketerAccountState, marketerProfileComplete } from "@/lib/marketer-account";
import { formatMoney, type Currency } from "@/lib/finance/types";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Overview | CDS Space Brand Marketers",
  alternates: { canonical: "https://cdsspace.pro/marketer" },
};

interface Commission { id: string; client_name: string | null; invoice_number: string; invoice_total: number; currency: Currency; commission_amount: number; status: string; earned_at: string; }

export default async function MarketerDashboardPage() {
  const account = await getMarketerAccountState();
  if (!account) redirect("/marketer/login");
  if (!account.agreement) redirect("/marketer/agreement");
  if (!account.profile.billing_currency) redirect("/marketer/onboarding");
  if (!marketerProfileComplete(account.profile)) redirect("/marketer/profile?setup=1");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any;
  const { data } = await db.from("brand_marketer_commissions").select("*").eq("marketer_user_id", account.user.id).order("earned_at", { ascending: false });
  const commissions = (data || []) as Commission[];
  const primaryCurrency = account.profile.billing_currency as Currency;
  const recentCommissions = commissions.slice(0, 6);
  const primary = commissions.filter((item) => item.currency === primaryCurrency && item.status !== "reversed");
  const total = primary.reduce((sum, item) => sum + Number(item.commission_amount), 0);
  const paid = primary.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.commission_amount), 0);
  const pending = primary.filter((item) => item.status === "earned" || item.status === "approved").reduce((sum, item) => sum + Number(item.commission_amount), 0);
  const displayName = account.profile.display_name || account.profile.full_name || "Brand Marketer";

  return <MarketerShell name={displayName} publicId={account.profile.public_id} code={account.profile.marketer_code}>
    <div className="space-y-7">
      <section className="overflow-hidden rounded-[16px] bg-[#0A4FE8] p-6 text-white shadow-[0_22px_60px_rgba(0,53,193,.2)] sm:p-8">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between"><div><div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.12em]"><BadgeCheck className="size-4" />Active Brand Marketer</div><h1 className="mt-5 text-[34px] font-bold leading-tight tracking-[-.04em] sm:text-[46px]">Welcome, {displayName.split(" ")[0]}.</h1><p className="mt-3 max-w-[570px] text-[14px] leading-6 text-white/75">Give clients your code before they pay. A verified paid invoice credits 5% to this dashboard automatically.</p></div><div className="min-w-[250px] rounded-[12px] border border-white/20 bg-white/10 p-5 backdrop-blur"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-white/60">Your marketer code</p><p className="mt-2 font-mono text-[30px] font-bold tracking-[.08em]">{account.profile.marketer_code}</p><p className="mt-2 text-[11px] text-white/65">Client enters this on the invoice payment page.</p></div></div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={BadgePercent} label="Total earned" value={formatMoney(total, primaryCurrency)} hint={`In ${primaryCurrency}`} /><Stat icon={ReceiptText} label="Pending payout" value={formatMoney(pending, primaryCurrency)} hint="Earned or approved" /><Stat icon={CreditCard} label="Paid out" value={formatMoney(paid, primaryCurrency)} hint="Completed payouts" /><Stat icon={UsersRound} label="Paid referrals" value={String(commissions.filter((x) => x.status !== "reversed").length)} hint="Attributed invoices" /></div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <section className="overflow-hidden rounded-[16px] border border-[#DDE5F4] bg-white"><div className="flex items-center justify-between border-b border-[#EDF0F6] px-5 py-4"><div><h2 className="text-[15px] font-semibold">Recent commission activity</h2><p className="mt-1 text-[11px] text-[#667085]">Every row is tied to a paid CDS Space invoice.</p></div><Link href="/marketer/earnings" className="text-[12px] font-semibold text-[#075BE5]">View all</Link></div>{commissions.length === 0 ? <div className="grid min-h-[260px] place-items-center p-8 text-center"><div><ReceiptText className="mx-auto size-8 text-[#C7D0E3]" /><p className="mt-3 text-[13px] font-semibold">No attributed paid invoices yet</p><p className="mt-1 text-[11px] text-[#98A2B3]">Share your marketer code with a client before their payment.</p></div></div> : <div className="divide-y divide-[#EDF0F6]">{recentCommissions.map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4"><div><p className="text-[13px] font-semibold">{item.client_name || "CDS Space client"}</p><p className="mt-1 text-[10px] text-[#98A2B3]">{item.invoice_number} · {new Date(item.earned_at).toLocaleDateString()}</p></div><div className="text-right"><p className="text-[13px] font-bold text-emerald-600">+{formatMoney(item.commission_amount, item.currency)}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-[.08em] text-[#98A2B3]">{item.status}</p></div></div>)}</div>}</section>
        <section className="rounded-[16px] border border-[#DDE5F4] bg-white p-5"><div className="grid size-11 place-items-center rounded-[12px] bg-blue-50 text-[#075BE5]"><IdCard className="size-5" /></div><h2 className="mt-5 text-[20px] font-bold">Official marketer ID</h2><p className="mt-2 text-[12px] leading-5 text-[#667085]">Your printable card includes the CDS Space logo, active status, public marketer ID and attribution code.</p><Link href="/marketer/id-card" className="mt-6 flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[#040B37] text-[13px] font-semibold text-white">View or print ID card <ArrowRight className="size-4" /></Link><div className="mt-4 rounded-[12px] bg-[#F3F6FD] p-4 text-[10px] leading-5 text-[#667085]">The card confirms programme membership only. It does not authorise collection of client payments.</div></section>
      </div>
    </div>
  </MarketerShell>;
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof BadgePercent; label: string; value: string; hint: string }) { return <div className="rounded-[16px] border border-[#DDE5F4] bg-white p-5"><div className="grid size-9 place-items-center rounded-[10px] bg-blue-50 text-[#075BE5]"><Icon className="size-4" /></div><p className="mt-4 text-[11px] font-semibold text-[#667085]">{label}</p><p className="mt-1 text-[24px] font-bold tracking-[-.03em]">{value}</p><p className="mt-1 text-[10px] text-[#98A2B3]">{hint}</p></div>; }
