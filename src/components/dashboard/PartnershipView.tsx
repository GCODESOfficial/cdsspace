"use client";

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Copy,
    Check,
    Sparkles,
    Wallet,
    ShieldCheck,
    IdCard,
    Share2,
    TrendingUp,
    Clock,
    BadgeCheck,
    ArrowRight,
    Banknote,
    Download,
    Printer,
    Link2,
    Lock,
    UserPlus,
    Zap,
    CheckCircle2,
    AlertCircle,
    QrCode,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Best Partner - full program view.
 *
 * Two states:
 *  - "landing": user is not a Best Partner yet → conversion-focused hero + benefits + paywall CTA.
 *  - "active":  user is a Best Partner → dashboard (link, earnings, payouts, KYC, ID card, share).
 *
 * Paystack integration is stubbed - see `handleJoin` and `handleWithdraw`.
 */

type PartnerStatus = "landing" | "active";
type KycStatus = "unverified" | "pending" | "verified";

const BENEFITS = [
    {
        icon: TrendingUp,
        title: "Earn 5% for life",
        body: "Every invoice paid through your link drops 5% Best Partner Bits straight to your dashboard.",
    },
    {
        icon: Zap,
        title: "Withdraw in 3–5 hours",
        body: "Request a payout any time. Processed Mon–Fri, 8:00am–5:30pm WAT.",
    },
    {
        icon: IdCard,
        title: "Official Partner ID",
        body: "Generate your ID card online - or request a printed copy delivered to you.",
    },
    {
        icon: Share2,
        title: "Branded share kit",
        body: "Share a link card carrying your name, code, and the CDS Space mark wherever you post.",
    },
];

const HOW_IT_WORKS = [
    { step: "01", title: "Join the program", body: "One-time activation. Unlocks your partner dashboard, link & ID kit." },
    { step: "02", title: "Verify with NIN / ID", body: "Quick online KYC so payouts can clear without friction." },
    { step: "03", title: "Share your link", body: "Drop your branded link anywhere - socials, DMs, decks, bios." },
    { step: "04", title: "Get paid", body: "5% Bits drop on every paid invoice. Withdraw anytime in working hours." },
];

const JOIN_PRICE_NGN = 15000; // placeholder - Paystack will own truth

export const PartnershipView = () => {
    // TODO: replace with real fetch from supabase (partner row keyed by user.id)
    const [status, setStatus] = useState<PartnerStatus>("landing");

    if (status === "landing") {
        return <BestPartnerLanding onJoined={() => setStatus("active")} />;
    }
    return <BestPartnerDashboard />;
};

/* ────────────────────────────────────────────────────────────────────────── */
/* LANDING - first-view conversion screen                                     */
/* ────────────────────────────────────────────────────────────────────────── */

const BestPartnerLanding = ({ onJoined }: { onJoined: () => void }) => {
    const [joining, setJoining] = useState(false);

    const handleJoin = async () => {
        setJoining(true);
        // TODO(paystack): open Paystack inline checkout for JOIN_PRICE_NGN.
        // On success: POST /api/best-partner/activate → flip status to "active".
        await new Promise((r) => setTimeout(r, 900));
        setJoining(false);
        onJoined();
    };

    return (
        <div className="w-full min-h-full bg-gradient-to-b from-[#F7F9FE] via-white to-white">
            {/* HERO */}
            <section className="relative overflow-hidden">
                {/* ambient blobs */}
                <div className="pointer-events-none absolute -top-40 -left-32 w-[520px] h-[520px] rounded-full bg-[#0575FF]/10 blur-3xl" />
                <div className="pointer-events-none absolute -top-20 right-0 w-[420px] h-[420px] rounded-full bg-[#7C3AED]/10 blur-3xl" />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(5,117,255,0.06),transparent_60%)]" />

                <div className="relative max-w-[1180px] mx-auto px-5 lg:px-10 pt-12 lg:pt-20 pb-14 lg:pb-24">
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                        className="flex flex-col items-center text-center"
                    >
                        <span className="inline-flex items-center gap-2 bg-white border border-[#E3E8F4] text-[#0035C1] text-[11px] lg:text-[12px] font-semibold tracking-[0.12em] uppercase rounded-full px-3 py-[6px] shadow-[0_4px_20px_rgba(0,53,193,0.06)]">
                            <Sparkles className="w-3.5 h-3.5" />
                            CDS Best Partner Program
                        </span>

                        <h1 className="mt-6 text-[#040B37] font-semibold tracking-[-0.02em] text-[34px] leading-[1.05] lg:text-[64px] lg:leading-[1.02] max-w-[860px]">
                            Get paid <span className="bg-gradient-to-r from-[#0035C1] to-[#0575FF] bg-clip-text text-transparent">5% for life</span><br className="hidden lg:block" /> for every brand you bring to CDS.
                        </h1>

                        <p className="mt-5 text-[#4B5563] text-[14px] lg:text-[18px] font-medium tracking-[-0.01em] max-w-[640px]">
                            Become a Best Partner. Share your branded link, earn Bits on every paid invoice,
                            and withdraw to your account in <span className="text-[#040B37] font-semibold">3–5 hours</span> during working hours.
                        </p>

                        {/* CTA */}
                        <div className="mt-9 flex flex-col sm:flex-row items-center gap-3">
                            <button
                                onClick={handleJoin}
                                disabled={joining}
                                className="group inline-flex items-center gap-2 bg-gradient-to-r from-[#0035C1] to-[#0575FF] text-white text-[14px] lg:text-[15px] font-semibold rounded-full pl-6 pr-5 h-[52px] shadow-[0_12px_30px_rgba(0,53,193,0.28)] hover:shadow-[0_16px_36px_rgba(0,53,193,0.34)] transition-all active:scale-[0.98] disabled:opacity-60"
                            >
                                {joining ? "Opening checkout…" : `Become a Best Partner - ₦${JOIN_PRICE_NGN.toLocaleString()}`}
                                <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                                    <ArrowRight className="w-4 h-4" />
                                </span>
                            </button>
                            <div className="flex items-center gap-2 text-[12px] lg:text-[13px] text-[#4B5578]">
                                <ShieldCheck className="w-4 h-4 text-[#0575FF]" />
                                One-time activation • Secured by Paystack
                            </div>
                        </div>

                        {/* trust strip */}
                        <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-5 w-full max-w-[820px]">
                            <TrustStat icon={BadgeCheck} label="Lifetime commission" value="5%" />
                            <TrustStat icon={Clock} label="Payout window" value="3–5 hrs" />
                            <TrustStat icon={Wallet} label="Min. withdrawal" value="₦5,000" />
                            <TrustStat icon={ShieldCheck} label="KYC" value="NIN / ID" />
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* BENEFITS */}
            <section className="relative max-w-[1180px] mx-auto px-5 lg:px-10 pb-14 lg:pb-20">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                    {BENEFITS.map((b, i) => (
                        <motion.div
                            key={b.title}
                            initial={{ opacity: 0, y: 14 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: i * 0.06 }}
                            className="bg-white border border-[#E3E8F4] rounded-2xl p-5 lg:p-6 hover:border-[#0575FF]/30 hover:shadow-[0_12px_30px_rgba(5,117,255,0.06)] transition-all"
                        >
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0035C1] to-[#0575FF] text-white flex items-center justify-center shadow-[0_8px_18px_rgba(5,117,255,0.25)]">
                                <b.icon className="w-5 h-5" strokeWidth={2} />
                            </div>
                            <h3 className="mt-4 text-[#040B37] text-[15px] lg:text-[16px] font-semibold tracking-[-0.01em]">{b.title}</h3>
                            <p className="mt-1.5 text-[#4B5563] text-[13px] lg:text-[14px] leading-[1.55]">{b.body}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* HOW IT WORKS */}
            <section className="relative max-w-[1180px] mx-auto px-5 lg:px-10 pb-16 lg:pb-24">
                <div className="bg-[#040B37] rounded-3xl p-6 lg:p-12 relative overflow-hidden">
                    <div className="pointer-events-none absolute -right-20 -top-20 w-[360px] h-[360px] rounded-full bg-[#0575FF]/20 blur-3xl" />
                    <div className="relative">
                        <h2 className="text-white text-[22px] lg:text-[34px] font-semibold tracking-[-0.02em] max-w-[560px]">
                            How the Best Partner program works
                        </h2>
                        <p className="mt-2 text-white/60 text-[13px] lg:text-[15px] max-w-[520px]">
                            Four steps. No paperwork shuffle. Just share, track, and get paid.
                        </p>

                        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                            {HOW_IT_WORKS.map((s) => (
                                <div key={s.step} className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
                                    <span className="text-white/40 text-[12px] font-mono tracking-[0.12em]">{s.step}</span>
                                    <h4 className="mt-2 text-white text-[15px] font-semibold">{s.title}</h4>
                                    <p className="mt-1.5 text-white/60 text-[13px] leading-[1.55]">{s.body}</p>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={handleJoin}
                            disabled={joining}
                            className="mt-10 inline-flex items-center gap-2 bg-white text-[#040B37] text-[14px] font-semibold rounded-full pl-6 pr-5 h-[50px] hover:bg-[#F4F6FB] transition-all active:scale-[0.98] disabled:opacity-60"
                        >
                            {joining ? "Opening checkout…" : "Activate Best Partner"}
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
};

const TrustStat = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
    <div className="bg-white/80 backdrop-blur border border-[#E3E8F4] rounded-2xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#EEF3FF] flex items-center justify-center">
            <Icon className="w-4 h-4 text-[#0035C1]" />
        </div>
        <div className="text-left">
            <div className="text-[#040B37] text-[14px] font-semibold leading-tight">{value}</div>
            <div className="text-[#8E99B7] text-[11px] font-medium">{label}</div>
        </div>
    </div>
);

/* ────────────────────────────────────────────────────────────────────────── */
/* DASHBOARD - active partner                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

const BestPartnerDashboard = () => {
    const [partnerName] = useState("Nasir Abdullahi");
    const [partnerCode] = useState("BP-NSR042");
    const affiliateLink = useMemo(
        () => `https://cds.agency/ref/${partnerCode.toLowerCase()}`,
        [partnerCode]
    );

    const [bits, setBits] = useState(48250); // ₦
    const [pending, setPending] = useState(12500);
    const [lifetime] = useState(184300);
    const [referrals] = useState(17);
    const [kyc, setKyc] = useState<KycStatus>("unverified");
    const [payout, setPayout] = useState<{ bank: string; account: string; name: string } | null>(null);

    const [copied, setCopied] = useState(false);
    const [showWithdraw, setShowWithdraw] = useState(false);
    const [showPayout, setShowPayout] = useState(false);
    const [showKyc, setShowKyc] = useState(false);
    const [showId, setShowId] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(affiliateLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    return (
        <div className="w-full min-h-full bg-[#F7F9FE]">
            <div className="max-w-[1180px] mx-auto px-5 lg:px-10 py-8 lg:py-12 space-y-6 lg:space-y-8">
                {/* header */}
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                    <div>
                        <span className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0035C1] to-[#0575FF] text-white text-[10px] lg:text-[11px] font-semibold tracking-[0.12em] uppercase rounded-full px-3 py-[5px]">
                            <BadgeCheck className="w-3.5 h-3.5" /> Best Partner • {partnerCode}
                        </span>
                        <h1 className="mt-3 text-[#040B37] text-[24px] lg:text-[34px] font-semibold tracking-[-0.02em]">
                            Welcome back, {partnerName.split(" ")[0]}.
                        </h1>
                        <p className="text-[#4B5563] text-[13px] lg:text-[15px] mt-1">
                            Track your Bits, manage payouts, and share your link.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowId(true)}
                            className="inline-flex items-center gap-2 bg-white border border-[#E3E8F4] hover:border-[#0575FF]/40 text-[#040B37] text-[13px] font-semibold rounded-full px-4 h-[42px] transition-all"
                        >
                            <IdCard className="w-4 h-4" /> ID Card
                        </button>
                        <button
                            onClick={() => setShowWithdraw(true)}
                            className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0035C1] to-[#0575FF] text-white text-[13px] font-semibold rounded-full px-5 h-[42px] shadow-[0_8px_22px_rgba(0,53,193,0.22)] hover:shadow-[0_12px_28px_rgba(0,53,193,0.28)] transition-all"
                        >
                            <Banknote className="w-4 h-4" /> Withdraw Bits
                        </button>
                    </div>
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                    <StatCard
                        gradient
                        label="Available Bits"
                        value={`₦${bits.toLocaleString()}`}
                        sub="Ready to withdraw"
                        icon={Wallet}
                    />
                    <StatCard label="Pending" value={`₦${pending.toLocaleString()}`} sub="Awaiting invoice payment" icon={Clock} />
                    <StatCard label="Lifetime earned" value={`₦${lifetime.toLocaleString()}`} sub="All-time Bits" icon={TrendingUp} />
                    <StatCard label="Referrals" value={`${referrals}`} sub="Brands you've brought" icon={UserPlus} />
                </div>

                {/* Link + Share */}
                <div className="bg-white border border-[#E3E8F4] rounded-2xl p-5 lg:p-7">
                    <div className="flex items-center gap-2 text-[#040B37] text-[14px] lg:text-[16px] font-semibold">
                        <Link2 className="w-4 h-4 text-[#0575FF]" /> Your Best Partner link
                    </div>
                    <p className="mt-1 text-[#8E99B7] text-[12px] lg:text-[13px]">
                        Every paid invoice tied to this link drops 5% Bits onto your dashboard.
                    </p>

                    <div className="mt-4 flex flex-col lg:flex-row items-stretch gap-2">
                        <div className="bg-[#F4F6FB] border border-[#E3E8F4] rounded-xl h-[48px] flex items-center px-4 flex-1 overflow-hidden">
                            <span className="text-[#040B37] text-[13px] lg:text-[15px] font-medium truncate">{affiliateLink}</span>
                        </div>
                        <button
                            onClick={handleCopy}
                            className="inline-flex items-center justify-center gap-2 bg-white border border-[#E3E8F4] hover:border-[#0575FF]/40 rounded-xl h-[48px] px-5 text-[#040B37] text-[13px] font-semibold transition-all"
                        >
                            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            {copied ? "Copied" : "Copy link"}
                        </button>
                        <button
                            onClick={() => navigator.share?.({ url: affiliateLink, title: "CDS Space" }).catch(() => {})}
                            className="inline-flex items-center justify-center gap-2 bg-[#040B37] hover:bg-[#0a154d] text-white rounded-xl h-[48px] px-5 text-[13px] font-semibold transition-all"
                        >
                            <Share2 className="w-4 h-4" /> Share kit
                        </button>
                    </div>

                    {/* share preview card (the metadata design) */}
                    <ShareMetaPreview name={partnerName} code={partnerCode} link={affiliateLink} />
                </div>

                {/* KYC + Payout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                    <ActionCard
                        icon={ShieldCheck}
                        title="Identity verification"
                        body={
                            kyc === "verified"
                                ? "Verified with NIN. Withdrawals enabled."
                                : kyc === "pending"
                                ? "Verification in review (usually under 1 hour)."
                                : "Verify with NIN or a government ID to enable withdrawals."
                        }
                        status={kyc}
                        cta={kyc === "verified" ? "Re-verify" : "Verify now"}
                        onClick={() => setShowKyc(true)}
                    />
                    <ActionCard
                        icon={Wallet}
                        title="Payout account"
                        body={
                            payout
                                ? `${payout.bank} • •••• ${payout.account.slice(-4)} • ${payout.name}`
                                : "Add a Nigerian bank account to receive Bits withdrawals."
                        }
                        status={payout ? "verified" : "unverified"}
                        cta={payout ? "Update" : "Add account"}
                        onClick={() => setShowPayout(true)}
                    />
                </div>

                {/* Earnings table */}
                <div className="bg-white border border-[#E3E8F4] rounded-2xl overflow-hidden">
                    <div className="p-5 lg:p-6 border-b border-[#E3E8F4] flex items-center justify-between">
                        <div>
                            <h3 className="text-[#040B37] text-[15px] lg:text-[16px] font-semibold">Recent earnings</h3>
                            <p className="text-[#8E99B7] text-[12px] mt-0.5">Bits drop here when an invoice is paid.</p>
                        </div>
                    </div>
                    <div className="divide-y divide-[#E3E8F4]">
                        {SAMPLE_EARNINGS.map((e) => (
                            <div key={e.id} className="p-5 lg:px-6 flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="text-[#040B37] text-[13px] lg:text-[14px] font-semibold truncate">{e.brand}</div>
                                    <div className="text-[#8E99B7] text-[11px] lg:text-[12px] mt-0.5">Invoice {e.invoice} • {e.date}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[#040B37] text-[13px] lg:text-[14px] font-semibold">+₦{e.bits.toLocaleString()}</div>
                                    <div className={cn("text-[11px] mt-0.5 font-medium", e.status === "paid" ? "text-green-600" : "text-amber-600")}>
                                        {e.status === "paid" ? "Bits dropped" : "Pending invoice"}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* MODALS */}
            <AnimatePresence>
                {showWithdraw && (
                    <WithdrawModal
                        bits={bits}
                        kycReady={kyc === "verified"}
                        payoutReady={!!payout}
                        onClose={() => setShowWithdraw(false)}
                        onConfirm={(amount) => {
                            setBits((b) => b - amount);
                            setShowWithdraw(false);
                        }}
                    />
                )}
                {showPayout && (
                    <PayoutModal
                        initial={payout}
                        onClose={() => setShowPayout(false)}
                        onSave={(p) => {
                            setPayout(p);
                            setShowPayout(false);
                        }}
                    />
                )}
                {showKyc && (
                    <KycModal
                        status={kyc}
                        onClose={() => setShowKyc(false)}
                        onSubmit={() => {
                            setKyc("pending");
                            setTimeout(() => setKyc("verified"), 1200);
                            setShowKyc(false);
                        }}
                    />
                )}
                {showId && (
                    <IdCardModal
                        name={partnerName}
                        code={partnerCode}
                        onClose={() => setShowId(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

/* ─── small dashboard pieces ──────────────────────────────────────────────── */

const SAMPLE_EARNINGS = [
    { id: "1", brand: "Lifepith Studios", invoice: "INV-2041", date: "Apr 3, 2026", bits: 12500, status: "paid" },
    { id: "2", brand: "Marogha & Co.", invoice: "INV-2038", date: "Mar 28, 2026", bits: 8750, status: "paid" },
    { id: "3", brand: "Tee's Kitchen", invoice: "INV-2036", date: "Mar 24, 2026", bits: 15000, status: "pending" },
    { id: "4", brand: "Citywave", invoice: "INV-2031", date: "Mar 18, 2026", bits: 12000, status: "paid" },
];

const StatCard = ({
    label,
    value,
    sub,
    icon: Icon,
    gradient,
}: {
    label: string;
    value: string;
    sub: string;
    icon: any;
    gradient?: boolean;
}) => (
    <div
        className={cn(
            "rounded-2xl p-5 lg:p-6 border transition-all",
            gradient
                ? "bg-gradient-to-br from-[#0035C1] to-[#0575FF] border-transparent text-white shadow-[0_18px_40px_rgba(0,53,193,0.22)]"
                : "bg-white border-[#E3E8F4]"
        )}
    >
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", gradient ? "bg-white/15" : "bg-[#EEF3FF]")}>
            <Icon className={cn("w-4.5 h-4.5", gradient ? "text-white" : "text-[#0035C1]")} />
        </div>
        <div className={cn("mt-4 text-[12px] font-medium", gradient ? "text-white/70" : "text-[#8E99B7]")}>{label}</div>
        <div className={cn("mt-1 text-[22px] lg:text-[26px] font-semibold tracking-[-0.01em]", gradient ? "text-white" : "text-[#040B37]")}>{value}</div>
        <div className={cn("mt-1 text-[11px]", gradient ? "text-white/60" : "text-[#8E99B7]")}>{sub}</div>
    </div>
);

const ActionCard = ({
    icon: Icon,
    title,
    body,
    status,
    cta,
    onClick,
}: {
    icon: any;
    title: string;
    body: string;
    status: KycStatus;
    cta: string;
    onClick: () => void;
}) => {
    const tone =
        status === "verified"
            ? { dot: "bg-green-500", label: "Verified", text: "text-green-600", bg: "bg-green-50", border: "border-green-100" }
            : status === "pending"
            ? { dot: "bg-amber-500", label: "Pending", text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" }
            : { dot: "bg-[#8E99B7]", label: "Action needed", text: "text-[#8E99B7]", bg: "bg-[#F4F6FB]", border: "border-[#E3E8F4]" };

    return (
        <div className="bg-white border border-[#E3E8F4] rounded-2xl p-5 lg:p-6 flex flex-col">
            <div className="flex items-start justify-between gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EEF3FF] flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#0035C1]" />
                </div>
                <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 border", tone.bg, tone.border, tone.text)}>
                    <span className={cn("w-1.5 h-1.5 rounded-full", tone.dot)} /> {tone.label}
                </span>
            </div>
            <h4 className="mt-4 text-[#040B37] text-[15px] font-semibold">{title}</h4>
            <p className="mt-1 text-[#4B5563] text-[13px] leading-[1.55] flex-1">{body}</p>
            <button
                onClick={onClick}
                className="mt-4 self-start inline-flex items-center gap-2 text-[#0035C1] hover:text-[#0575FF] text-[13px] font-semibold transition-colors"
            >
                {cta} <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
};

/* ─── share metadata preview (the link card image users post) ─────────────── */

const ShareMetaPreview = ({ name, code, link }: { name: string; code: string; link: string }) => (
    <div className="mt-6 relative rounded-2xl overflow-hidden border border-[#E3E8F4] bg-gradient-to-br from-[#040B37] via-[#0a1452] to-[#0035C1] p-6 lg:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 w-[260px] h-[260px] rounded-full bg-[#0575FF]/40 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/15 text-white text-[10px] font-semibold tracking-[0.16em] uppercase rounded-full px-3 py-[5px]">
                    CDS Space • Best Partner
                </div>
                <div className="mt-5 text-white/60 text-[12px] uppercase tracking-[0.14em]">Partner</div>
                <div className="text-white text-[28px] lg:text-[40px] font-semibold tracking-[-0.02em] leading-[1.05]">{name}</div>
                <div className="mt-3 text-white/60 text-[12px] uppercase tracking-[0.14em]">Code</div>
                <div className="text-white text-[22px] lg:text-[28px] font-bold font-mono tracking-[0.04em]">{code}</div>
                <div className="mt-4 text-white/70 text-[12px] lg:text-[13px] truncate max-w-[420px]">{link}</div>
            </div>
            <div className="flex flex-col items-end gap-3">
                <div className="w-[88px] h-[88px] rounded-xl bg-white/10 backdrop-blur border border-white/15 flex items-center justify-center">
                    <QrCode className="w-12 h-12 text-white/80" />
                </div>
                <div className="text-white/40 text-[10px] uppercase tracking-[0.16em]">cds.agency</div>
            </div>
        </div>
        <div className="relative mt-6 flex items-center gap-2">
            <button className="inline-flex items-center gap-2 bg-white text-[#040B37] text-[12px] font-semibold rounded-full px-4 h-[36px] hover:bg-[#F4F6FB] transition-all">
                <Download className="w-3.5 h-3.5" /> Download as image
            </button>
            <button className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/15 text-white text-[12px] font-semibold rounded-full px-4 h-[36px] hover:bg-white/15 transition-all">
                <Share2 className="w-3.5 h-3.5" /> Share to socials
            </button>
        </div>
    </div>
);

/* ─── modals ──────────────────────────────────────────────────────────────── */

const ModalShell = ({ children, onClose, title, subtitle }: { children: React.ReactNode; onClose: () => void; title: string; subtitle?: string }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
    >
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl w-full max-w-[480px] p-6 lg:p-7 shadow-2xl"
        >
            <h3 className="text-[#040B37] text-[18px] lg:text-[20px] font-semibold tracking-[-0.01em]">{title}</h3>
            {subtitle && <p className="text-[#8E99B7] text-[13px] mt-1">{subtitle}</p>}
            <div className="mt-5">{children}</div>
        </motion.div>
    </motion.div>
);

const WithdrawModal = ({
    bits,
    kycReady,
    payoutReady,
    onClose,
    onConfirm,
}: {
    bits: number;
    kycReady: boolean;
    payoutReady: boolean;
    onClose: () => void;
    onConfirm: (amount: number) => void;
}) => {
    const [amount, setAmount] = useState<string>("");
    const blocked = !kycReady || !payoutReady;
    const value = Number(amount) || 0;
    const valid = value >= 5000 && value <= bits && !blocked;

    return (
        <ModalShell title="Withdraw Bits" subtitle="Processed Mon–Fri, 8:00am–5:30pm WAT (3–5 hours)." onClose={onClose}>
            {blocked && (
                <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3 text-amber-700 text-[12px]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                        Complete {!kycReady && "identity verification"}{!kycReady && !payoutReady && " and "}{!payoutReady && "your payout account"} before withdrawing.
                    </div>
                </div>
            )}
            <label className="text-[#040B37] text-[13px] font-semibold">Amount (₦)</label>
            <div className="mt-2 flex items-center bg-[#F4F6FB] border border-[#E3E8F4] rounded-xl px-4 h-[52px]">
                <span className="text-[#8E99B7] text-[15px] font-medium">₦</span>
                <input
                    autoFocus
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    className="flex-1 bg-transparent outline-none text-[#040B37] text-[15px] font-semibold pl-2"
                />
                <button onClick={() => setAmount(String(bits))} className="text-[#0035C1] text-[12px] font-semibold">MAX</button>
            </div>
            <div className="mt-2 text-[#8E99B7] text-[12px]">Available: ₦{bits.toLocaleString()} • Min ₦5,000</div>
            <button
                disabled={!valid}
                onClick={() => onConfirm(value)}
                className="mt-5 w-full h-[50px] rounded-full bg-gradient-to-r from-[#0035C1] to-[#0575FF] text-white text-[14px] font-semibold disabled:opacity-50 transition-all"
            >
                Confirm withdrawal
            </button>
        </ModalShell>
    );
};

const PayoutModal = ({
    initial,
    onClose,
    onSave,
}: {
    initial: { bank: string; account: string; name: string } | null;
    onClose: () => void;
    onSave: (p: { bank: string; account: string; name: string }) => void;
}) => {
    const [bank, setBank] = useState(initial?.bank ?? "");
    const [account, setAccount] = useState(initial?.account ?? "");
    const [name, setName] = useState(initial?.name ?? "");
    const valid = bank && account.length >= 10 && name;

    return (
        <ModalShell title="Payout account" subtitle="Where your Bits withdrawals will land." onClose={onClose}>
            <div className="space-y-3">
                <Field label="Bank">
                    <select
                        value={bank}
                        onChange={(e) => setBank(e.target.value)}
                        className="w-full bg-transparent outline-none text-[#040B37] text-[14px] font-medium"
                    >
                        <option value="">Select bank</option>
                        {["Access Bank", "GTBank", "Zenith Bank", "UBA", "First Bank", "Kuda", "Opay", "Moniepoint", "PalmPay"].map((b) => (
                            <option key={b}>{b}</option>
                        ))}
                    </select>
                </Field>
                <Field label="Account number">
                    <input
                        value={account}
                        onChange={(e) => setAccount(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                        inputMode="numeric"
                        placeholder="0123456789"
                        className="w-full bg-transparent outline-none text-[#040B37] text-[14px] font-medium"
                    />
                </Field>
                <Field label="Account name">
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="As shown on your bank record"
                        className="w-full bg-transparent outline-none text-[#040B37] text-[14px] font-medium"
                    />
                </Field>
            </div>
            <button
                disabled={!valid}
                onClick={() => onSave({ bank, account, name })}
                className="mt-5 w-full h-[50px] rounded-full bg-gradient-to-r from-[#0035C1] to-[#0575FF] text-white text-[14px] font-semibold disabled:opacity-50"
            >
                Save account
            </button>
        </ModalShell>
    );
};

const KycModal = ({ status, onClose, onSubmit }: { status: KycStatus; onClose: () => void; onSubmit: () => void }) => {
    const [docType, setDocType] = useState<"nin" | "id">("nin");
    const [value, setValue] = useState("");
    const valid = value.length >= 6;

    return (
        <ModalShell title="Identity verification" subtitle="Verify with NIN or a government ID. Usually under an hour." onClose={onClose}>
            <div className="grid grid-cols-2 gap-2 mb-4">
                {(["nin", "id"] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => setDocType(t)}
                        className={cn(
                            "h-[44px] rounded-xl border text-[13px] font-semibold transition-all",
                            docType === t
                                ? "bg-[#040B37] text-white border-[#040B37]"
                                : "bg-white border-[#E3E8F4] text-[#4B5563] hover:border-[#0575FF]/40"
                        )}
                    >
                        {t === "nin" ? "NIN" : "Government ID"}
                    </button>
                ))}
            </div>
            <Field label={docType === "nin" ? "NIN number" : "ID number"}>
                <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={docType === "nin" ? "11-digit NIN" : "ID number"}
                    className="w-full bg-transparent outline-none text-[#040B37] text-[14px] font-medium"
                />
            </Field>
            {status === "verified" && (
                <div className="mt-3 flex items-center gap-2 text-green-600 text-[12px] font-semibold">
                    <CheckCircle2 className="w-4 h-4" /> Already verified - re-submitting will replace your record.
                </div>
            )}
            <button
                disabled={!valid}
                onClick={onSubmit}
                className="mt-5 w-full h-[50px] rounded-full bg-gradient-to-r from-[#0035C1] to-[#0575FF] text-white text-[14px] font-semibold disabled:opacity-50"
            >
                Submit for verification
            </button>
        </ModalShell>
    );
};

const IdCardModal = ({ name, code, onClose }: { name: string; code: string; onClose: () => void }) => (
    <ModalShell title="Best Partner ID Card" subtitle="Download your card or request a printed copy." onClose={onClose}>
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#040B37] via-[#0a1452] to-[#0035C1] p-5 relative">
            <div className="pointer-events-none absolute -right-12 -top-12 w-[200px] h-[200px] rounded-full bg-[#0575FF]/40 blur-3xl" />
            <div className="relative">
                <div className="flex items-center justify-between">
                    <div className="text-white/70 text-[10px] tracking-[0.16em] uppercase font-semibold">CDS Space</div>
                    <div className="text-white/70 text-[10px] tracking-[0.16em] uppercase font-semibold">Best Partner</div>
                </div>
                <div className="mt-6 flex items-end gap-4">
                    <div className="w-[64px] h-[64px] rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                        <BadgeCheck className="w-7 h-7 text-white/90" />
                    </div>
                    <div>
                        <div className="text-white/60 text-[10px] uppercase tracking-[0.14em]">Name</div>
                        <div className="text-white text-[20px] font-semibold tracking-[-0.01em]">{name}</div>
                        <div className="mt-1 text-white/60 text-[10px] uppercase tracking-[0.14em]">Code</div>
                        <div className="text-white text-[14px] font-mono font-bold">{code}</div>
                    </div>
                </div>
                <div className="mt-5 flex items-center justify-between text-white/50 text-[10px]">
                    <span>Issued {new Date().toLocaleDateString()}</span>
                    <span>cds.agency</span>
                </div>
            </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
            <button className="h-[46px] rounded-xl bg-[#040B37] text-white text-[13px] font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#0a154d] transition-all">
                <Download className="w-4 h-4" /> Download
            </button>
            <button className="h-[46px] rounded-xl bg-white border border-[#E3E8F4] text-[#040B37] text-[13px] font-semibold inline-flex items-center justify-center gap-2 hover:border-[#0575FF]/40 transition-all">
                <Printer className="w-4 h-4" /> Request print
            </button>
        </div>
    </ModalShell>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
        <label className="text-[#040B37] text-[12px] font-semibold">{label}</label>
        <div className="mt-1.5 bg-[#F4F6FB] border border-[#E3E8F4] rounded-xl px-4 h-[48px] flex items-center">{children}</div>
    </div>
);
