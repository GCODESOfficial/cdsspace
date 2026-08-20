"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import FormattedRoleText from "@/components/hrm/FormattedRoleText";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import { cn } from "@/lib/utils";
import {
    Briefcase, MapPin, Clock, ArrowRight, Calendar,
    Coffee, GraduationCap, Award, Loader2, ExternalLink, X, Check, Plus,
    Search, Copy, CheckCircle2, FileSearch, Globe2, ShieldCheck,
} from "lucide-react";

interface OpenRole {
    id: string;
    title: string;
    role_type: string;
    location: string | null;
    description: string;
    requirements: string;
    perks: string | null;
    application_link: string | null;
    is_active: boolean;
    created_at: string;
}

interface StatusResult {
    tracking_code: string;
    full_name: string;
    status: "new" | "reviewing" | "shortlisted" | "rejected" | "hired";
    admin_note: string | null;
    created_at: string;
    status_updated_at: string | null;
    role: { title: string; role_type: string; location: string | null } | null;
}

const PERKS = [
    { icon: Globe2, title: "Global-standard projects", desc: "Work on brand systems, campaigns, and digital products built to compete beyond one market." },
    { icon: GraduationCap, title: "Hands-on mentorship", desc: "Learn directly from senior creatives and builders while working on real client outcomes." },
    { icon: Coffee, title: "Calm studio rhythm", desc: "A focused environment for deep work, thoughtful critique, and clean creative execution." },
    { icon: Calendar, title: "Flexible schedules", desc: "Respectful planning, async-friendly collaboration, and room to do your best work." },
    { icon: ShieldCheck, title: "Faith-sensitive workplace", desc: "A considerate team culture that makes space for conviction, discipline, and care." },
];

const ROLE_TYPE_LABELS: Record<string, string> = {
    "full-time": "Full-time",
    "part-time": "Part-time",
    "contract": "Contract",
    "intern": "Internship",
    "freelance": "Freelance",
};

const ROLE_TYPE_COLORS: Record<string, string> = {
    "full-time": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "part-time": "bg-blue-50 text-blue-700 border-blue-200",
    "contract": "bg-purple-50 text-purple-700 border-purple-200",
    "intern": "bg-amber-50 text-amber-700 border-amber-200",
    "freelance": "bg-cyan-50 text-cyan-700 border-cyan-200",
};

const FILTERS: { id: string; label: string }[] = [
    { id: "all", label: "All" },
    { id: "full-time", label: "Full-time" },
    { id: "intern", label: "Internship" },
    { id: "contract", label: "Contract" },
    { id: "freelance", label: "Freelance" },
];

const STATUS_META: Record<
    StatusResult["status"],
    { label: string; color: string; step: number; message: string }
> = {
    new: { label: "Received", color: "bg-blue-50 text-brand-blue border-blue-200", step: 1, message: "We've got your application. It's in the queue." },
    reviewing: { label: "Under Review", color: "bg-amber-50 text-amber-700 border-amber-200", step: 2, message: "Our team is looking through your submission." },
    shortlisted: { label: "Shortlisted", color: "bg-emerald-50 text-emerald-700 border-emerald-200", step: 3, message: "Good news - you've been shortlisted. Expect to hear from us soon." },
    hired: { label: "Hired", color: "bg-emerald-100 text-emerald-800 border-emerald-300", step: 4, message: "Welcome to the team!" },
    rejected: { label: "Not a Fit", color: "bg-rose-50 text-rose-700 border-rose-200", step: 4, message: "Thank you for applying. We won't be moving forward at this time." },
};

export default function CareerClient({ initialRoleId }: { initialRoleId?: string }) {
    const [roles, setRoles] = useState<OpenRole[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [selectedRole, setSelectedRole] = useState<OpenRole | null>(null);
    const [showCertModal, setShowCertModal] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [copiedRoleId, setCopiedRoleId] = useState<string | null>(null);

    useEffect(() => {
        async function fetchRoles() {
            const { data } = await supabase
                .from("open_roles")
                .select("*")
                .eq("is_active", true)
                .order("created_at", { ascending: false });
            setRoles(data || []);
            setIsLoading(false);
        }
        fetchRoles();
    }, []);

    useEffect(() => {
        if (roles.length === 0) return;

        const syncRoleFromUrl = () => {
            const params = new URLSearchParams(window.location.search);
            const pathMatch = window.location.pathname.match(/\/Career\/role\/([^/?#]+)/i);
            const roleId = pathMatch ? decodeURIComponent(pathMatch[1]) : (params.get("role") || initialRoleId);
            if (!roleId) {
                setSelectedRole(null);
                return;
            }

            const linkedRole = roles.find(role => role.id === roleId);
            if (linkedRole) setSelectedRole(linkedRole);
        };

        syncRoleFromUrl();
        window.addEventListener("popstate", syncRoleFromUrl);
        return () => window.removeEventListener("popstate", syncRoleFromUrl);
    }, [roles, initialRoleId]);

    const filtered = useMemo(
        () => (filter === "all" ? roles : roles.filter(r => r.role_type === filter)),
        [roles, filter]
    );

    const counts = useMemo(() => {
        const c: Record<string, number> = { all: roles.length };
        roles.forEach(r => { c[r.role_type] = (c[r.role_type] || 0) + 1; });
        return c;
    }, [roles]);

    function roleLink(roleId: string) {
        const path = `/Career/role/${encodeURIComponent(roleId)}`;
        if (typeof window === "undefined") return path;
        return new URL(path, window.location.origin).toString();
    }

    async function writeToClipboard(value: string) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return;
        }

        const input = document.createElement("textarea");
        input.value = value;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
    }

    async function copyRoleLink(role: OpenRole) {
        await writeToClipboard(roleLink(role.id));
        setCopiedRoleId(role.id);
        window.setTimeout(() => setCopiedRoleId(current => current === role.id ? null : current), 2000);
    }

    function openRole(role: OpenRole) {
        setSelectedRole(role);
        window.history.pushState({ roleId: role.id }, "", `/Career?role=${encodeURIComponent(role.id)}`);
    }

    function closeSelectedRole() {
        const activeRoleId = selectedRole?.id;
        setSelectedRole(null);

        if (!activeRoleId) return;
        const url = new URL(window.location.href);
        if (url.searchParams.get("role") !== activeRoleId) return;
        url.searchParams.delete("role");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }

    return (
        <main className="min-h-screen bg-brand-bg selection:bg-brand-blue selection:text-white">
            <section className="relative w-full overflow-hidden bg-brand-bg pt-[116px] pb-[72px] sm:pt-[132px] sm:pb-[96px] md:pt-[174px] md:pb-[120px]">
                <div
                    className="absolute left-[-72px] top-[88px] h-[140px] w-[140px] rounded-full bg-brand-blue/10 blur-[80px] sm:left-[-106px] sm:top-[109px] sm:h-[190px] sm:w-[190px]"
                    aria-hidden="true"
                />
                <div
                    className="absolute hidden h-[118px] w-[118px] rounded-full bg-brand-blue/5 blur-[60px] sm:left-[329px] sm:top-[328px] sm:block"
                    aria-hidden="true"
                />

                <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center px-4 sm:px-5 md:px-10">
                    <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="flex w-full max-w-[1200px] flex-col items-center text-center"
                    >
                        <div className="flex flex-wrap items-center justify-center gap-2 rounded-[8px] border border-white bg-[#e6ebf7] px-3 py-2">
                            <span className="text-[14px] font-semibold leading-none tracking-[-0.16px] text-[#4B5563] md:text-[16px]">
                                Now welcoming talent
                            </span>
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#16A34A] opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#16A34A]" />
                            </span>
                            <span className="text-[14px] font-medium leading-none tracking-[-0.16px] text-[#4B5563] md:text-[16px]">
                                Interns & full-time roles
                            </span>
                        </div>

                        <h1 className="mt-6 max-w-[784px] text-balance text-[29px] font-semibold leading-[1.15] tracking-[-0.8px] text-[#040B37] sm:text-[40px] md:mt-8 md:text-[48px] md:leading-[1.24] md:tracking-[-1.12px] lg:text-[56px]">
                            Build your career where brands grow.
                        </h1>
                        <p className="mt-5 max-w-[580px] px-1 text-pretty text-[15px] font-medium leading-[1.5] tracking-[-0.2px] text-[#4B5563] sm:px-2 sm:text-[18px] md:mt-8 lg:text-[20px]">
                            Join the CDS Space team to learn clear strategy, sharp execution, and thoughtful creative standards while building work for ambitious brands.
                        </p>

                        <div className="mt-8 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
                            <a
                                href="#open-roles"
                                className="rounded-[100px] border border-[#648EFC] bg-[#F4F6FB] p-[2px] transition-opacity hover:opacity-90"
                            >
                                <span
                                    className="flex items-center justify-center gap-2 rounded-[100px] px-6 py-3.5 text-[15px] font-medium text-brand-bg sm:px-8 sm:text-[16px]"
                                    style={{ background: "var(--color-brand-gradient)" }}
                                >
                                    View Open Roles
                                    <ArrowRight className="h-4 w-4" />
                                </span>
                            </a>
                            <button
                                onClick={() => setShowStatusModal(true)}
                                className="flex items-center justify-center gap-2 rounded-[100px] border border-white bg-white px-6 py-3.5 text-[15px] font-semibold text-brand-navy shadow-sm transition hover:border-[#648EFC] hover:text-brand-blue sm:px-8 sm:text-[16px]"
                            >
                                <FileSearch className="h-4 w-4" />
                                Check Application Status
                            </button>
                        </div>

                        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[12px] text-[#7B8495] sm:text-[13px]">
                            <span className="inline-flex items-center gap-1.5"><Globe2 className="h-3.5 w-3.5 text-brand-blue" /> Global-standard projects</span>
                            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-brand-blue" /> Faith-sensitive workplace</span>
                            <span className="inline-flex items-center gap-1.5"><Award className="h-3.5 w-3.5 text-brand-blue" /> Intern certification</span>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.15 }}
                        className="relative mt-14 flex min-h-[420px] w-full max-w-[1408px] overflow-hidden rounded-[18px] bg-[#040B37] px-5 py-12 shadow-[0_12px_24px_rgba(4,11,55,0.10),0_32px_64px_rgba(4,11,55,0.15)] sm:mt-16 sm:min-h-[500px] sm:px-8 md:mt-[104px] md:min-h-[620px] md:rounded-[24px] md:px-14 md:py-16"
                    >
                        <div
                            className="absolute top-[-210px] left-1/2 h-[563px] w-[367px] -translate-x-1/2 opacity-70 blur-[60px]"
                            style={{ background: "radial-gradient(50% 50% at 50% 50%, #0575FF 0%, rgba(5, 117, 255, 0) 100%)" }}
                            aria-hidden="true"
                        />
                        <div
                            className="absolute inset-0 opacity-20"
                            style={{
                                backgroundImage: "radial-gradient(circle at 1.5px 1.5px, #ffffff 1px, transparent 0)",
                                backgroundSize: "40px 40px",
                            }}
                            aria-hidden="true"
                        />
                        <div className="pointer-events-none absolute bottom-0 left-0 hidden h-[530px] w-[659px] opacity-30 mix-blend-color-dodge lg:block">
                            <Image src="/home/assets/Objects2.svg" alt="" fill className="object-cover" />
                        </div>
                        <div className="pointer-events-none absolute right-0 bottom-0 hidden h-[531px] w-[661px] opacity-30 lg:block">
                            <Image src="/home/assets/Objects.svg" alt="" fill className="object-cover" />
                        </div>

                        <div className="relative z-10 mx-auto flex w-full max-w-[784px] flex-col items-center justify-center gap-8 text-center md:gap-10">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#8BB9FF]">
                                Inside the studio
                            </p>
                            <div className="flex w-full flex-col items-center gap-5">
                                <h2 className="max-w-[620px] text-balance text-4xl font-semibold leading-[1.24] tracking-[-1.28px] text-white md:text-5xl lg:text-[64px]">
                                    Learn the craft. Build the system. Raise the standard.
                                </h2>
                                <p className="max-w-[560px] text-base font-medium leading-relaxed tracking-[-0.18px] text-brand-mute md:text-[18px]">
                                    Careers at CDS Space are designed around useful feedback, visible ownership, and projects that teach you how excellent work gets shipped.
                                </p>
                            </div>
                            <div className="grid w-full max-w-[780px] grid-cols-1 gap-3 sm:grid-cols-3">
                                {[
                                    ["01", "Real project ownership"],
                                    ["02", "Clear creative direction"],
                                    ["03", "Growth you can measure"],
                                ].map(([number, label]) => (
                                    <div key={number} className="rounded-[16px] border border-white/10 bg-white/[0.06] px-4 py-4 text-left backdrop-blur-sm md:px-5 md:py-5">
                                        <p className="text-[12px] font-medium tracking-[-0.12px] text-[#8BB9FF]">{number}</p>
                                        <p className="mt-3 text-[15px] font-medium leading-[1.35] tracking-[-0.15px] text-white sm:text-[16px]">{label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            <section className="overflow-hidden bg-brand-bg/50 pb-16 md:pb-24">
                <div className="section-container">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mb-14 flex flex-col items-center text-center md:mb-16"
                    >
                        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-blue">Why join us</p>
                        <h2 className="max-w-[720px] text-balance text-[30px] font-bold leading-tight text-brand-navy md:text-[48px]">
                            More than a job. A creative home.
                        </h2>
                        <p className="mt-5 max-w-[620px] text-[15px] leading-relaxed text-brand-body md:text-[16px]">
                            We keep the same clean, deliberate standard on our team experience that clients see in the work.
                        </p>
                    </motion.div>

                    <div className="relative">
                        <div className="grid grid-cols-1 md:grid-cols-3">
                            {PERKS.slice(0, 3).map((perk, idx) => {
                                const Icon = perk.icon;
                                return (
                                    <div
                                        key={perk.title}
                                        className={cn(
                                            "group relative flex flex-col items-center p-8 text-center md:p-12",
                                            idx < 2 && "md:after:absolute md:after:top-1/2 md:after:right-0 md:after:h-40 md:after:w-px md:after:-translate-y-1/2 md:after:bg-brand-stroke md:after:content-['']"
                                        )}
                                    >
                                        <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-xl border-[4px] border-white bg-brand-stroke shadow-sm transition-transform duration-300 group-hover:scale-110">
                                            <Icon className="h-6 w-6 text-brand-navy" />
                                        </div>
                                        <h3 className="mb-3 text-xl font-bold text-brand-navy">{perk.title}</h3>
                                        <p className="max-w-[280px] text-brand-body leading-relaxed">{perk.desc}</p>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="my-8 hidden h-px w-full bg-brand-stroke md:block" />

                        <div className="mx-auto grid max-w-4xl grid-cols-1 md:grid-cols-2">
                            {PERKS.slice(3).map((perk, idx) => {
                                const Icon = perk.icon;
                                return (
                                    <div
                                        key={perk.title}
                                        className={cn(
                                            "group relative flex flex-col items-center p-8 text-center md:p-12",
                                            idx === 0 && "md:after:absolute md:after:top-1/2 md:after:right-0 md:after:h-40 md:after:w-px md:after:-translate-y-1/2 md:after:bg-brand-stroke md:after:content-['']"
                                        )}
                                    >
                                        <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-xl border-[4px] border-white bg-brand-stroke shadow-sm transition-transform duration-300 group-hover:scale-110">
                                            <Icon className="h-6 w-6 text-brand-navy" />
                                        </div>
                                        <h3 className="mb-3 text-xl font-bold text-brand-navy">{perk.title}</h3>
                                        <p className="max-w-[280px] text-brand-body leading-relaxed">{perk.desc}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </section>

            <section id="open-roles" className="scroll-mt-28 bg-brand-bg pb-16 md:pb-24">
                <div className="section-container">
                    <div className="mb-8 flex flex-col items-center gap-6 text-center lg:mb-12">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="mx-auto max-w-[720px]"
                        >
                            <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-blue">Open positions</p>
                            <h2 className="text-balance text-[30px] font-bold leading-tight text-brand-navy md:text-[48px]">
                                Find the team where your work can grow.
                            </h2>
                            <p className="mt-4 text-[15px] leading-relaxed text-brand-body md:text-[16px]">
                                Browse active full-time, contract, freelance, and internship opportunities.
                            </p>
                        </motion.div>

                        {!isLoading && roles.length > 0 && (
                            <div className="no-scrollbar flex w-full justify-start gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:justify-center">
                                {FILTERS.map(f => {
                                    const count = counts[f.id] || 0;
                                    const isActive = filter === f.id;
                                    const isDisabled = f.id !== "all" && count === 0;
                                    return (
                                        <button
                                            key={f.id}
                                            onClick={() => !isDisabled && setFilter(f.id)}
                                            disabled={isDisabled}
                                            className={cn(
                                                "shrink-0 rounded-[100px] border px-4 py-2 text-[13px] font-medium transition",
                                                isActive && "border-brand-navy bg-brand-navy text-white",
                                                !isActive && !isDisabled && "border-brand-stroke bg-white text-brand-body hover:border-brand-blue/50 hover:text-brand-blue",
                                                isDisabled && "cursor-not-allowed border-brand-stroke/40 bg-white/50 text-brand-body/30"
                                            )}
                                        >
                                            {f.label}
                                            <span className={cn("ml-2 text-[11px]", isActive ? "text-white/70" : "text-brand-body/40")}>{count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="mx-auto max-w-[960px]">
                        {isLoading ? (
                            <div className="flex justify-center py-16">
                                <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="rounded-[24px] border border-brand-stroke bg-white px-5 py-16 text-center shadow-sm sm:px-8">
                                <Briefcase className="mx-auto mb-4 h-12 w-12 text-brand-stroke" />
                                <p className="text-[16px] font-semibold text-brand-navy">
                                    {roles.length === 0 ? "No open positions right now" : "No roles match this filter"}
                                </p>
                                <p className="mt-2 text-[14px] text-brand-body/70">
                                    {roles.length === 0 ? "Check back soon. We keep this page updated as new roles open." : "Try another category, or view all roles."}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filtered.map((role, i) => {
                                    const isCopied = copiedRoleId === role.id;
                                    return (
                                    <motion.div
                                        key={role.id}
                                        initial={{ opacity: 0, y: 18 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.04 }}
                                        className="group w-full rounded-[22px] border border-brand-stroke bg-white p-5 text-left shadow-sm transition hover:border-brand-blue/50 hover:shadow-[0_20px_45px_rgba(4,11,55,0.08)] sm:p-6 md:rounded-[24px] md:p-7"
                                    >
                                        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                                            <button
                                                type="button"
                                                onClick={() => openRole(role)}
                                                className="min-w-0 flex-1 text-left"
                                            >
                                                <div className="mb-3 flex flex-wrap items-center gap-3">
                                                    <h3 className="text-[20px] font-bold leading-tight text-brand-navy transition group-hover:text-brand-blue">
                                                        {role.title}
                                                    </h3>
                                                    <span className={`rounded-[8px] border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${ROLE_TYPE_COLORS[role.role_type] || "bg-gray-100 text-gray-600"}`}>
                                                        {ROLE_TYPE_LABELS[role.role_type] || role.role_type}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-brand-body/70">
                                                    {role.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{role.location}</span>}
                                                    <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Posted {new Date(role.created_at).toLocaleDateString()}</span>
                                                </div>
                                                <p className="mt-4 line-clamp-2 text-[14px] leading-relaxed text-brand-body/75">{role.description}</p>
                                            </button>

                                            <div className="flex w-full items-center gap-2 sm:w-auto md:self-start">
                                                <button
                                                    type="button"
                                                    onClick={() => copyRoleLink(role)}
                                                    title={isCopied ? "Copied" : "Copy role link"}
                                                    aria-label={isCopied ? `Copied link for ${role.title}` : `Copy link for ${role.title}`}
                                                    className={cn(
                                                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition",
                                                        isCopied
                                                            ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                                                            : "border-brand-stroke bg-white text-brand-body hover:border-brand-blue/50 hover:text-brand-blue"
                                                    )}
                                                >
                                                    {isCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                                </button>
                                                <UniversalShareButton
                                                    title={`${role.title} - CDS Space`}
                                                    text={`${role.title} (${ROLE_TYPE_LABELS[role.role_type] || role.role_type})${role.location ? `, ${role.location}` : ""} at CDS Space.`}
                                                    url={roleLink(role.id)}
                                                    label=""
                                                    className="h-11 min-h-11 w-11 shrink-0 rounded-full border-brand-stroke p-0 text-brand-body shadow-none hover:border-brand-blue/50 hover:text-brand-blue"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => openRole(role)}
                                                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[100px] bg-brand-bg px-4 text-[14px] font-semibold text-brand-navy transition group-hover:bg-brand-blue group-hover:text-white sm:flex-none"
                                                >
                                                View role
                                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <section className="w-full bg-brand-bg px-4 pb-20 md:px-6 md:pb-28 lg:px-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="relative mx-auto max-w-[1408px] overflow-hidden rounded-[24px] bg-[#040B37] px-5 py-10 sm:px-8 md:px-12 md:py-14"
                >
                    <div
                        className="absolute top-[-220px] left-1/2 h-[520px] w-[360px] -translate-x-1/2 opacity-60 blur-[60px]"
                        style={{ background: "radial-gradient(50% 50% at 50% 50%, #0575FF 0%, rgba(5, 117, 255, 0) 100%)" }}
                        aria-hidden="true"
                    />
                    <div
                        className="absolute inset-0 opacity-20"
                        style={{
                            backgroundImage: "radial-gradient(circle at 1.5px 1.5px, #ffffff 1px, transparent 0)",
                            backgroundSize: "40px 40px",
                        }}
                        aria-hidden="true"
                    />
                    <div className="pointer-events-none absolute bottom-0 left-0 hidden h-[530px] w-[659px] opacity-25 mix-blend-color-dodge lg:block">
                        <Image src="/home/assets/Objects2.svg" alt="" fill className="object-cover" />
                    </div>
                    <div className="relative z-10 flex flex-col items-center text-center">
                        <div className="mx-auto max-w-[780px]">
                            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8BB9FF]">Keep moving</p>
                            <h2 className="mt-4 text-balance text-[30px] font-semibold leading-tight text-white md:text-[46px]">
                                Already applied or finished an internship?
                            </h2>
                            <p className="mx-auto mt-4 max-w-[620px] text-[15px] leading-relaxed text-white/68 lg:text-[17px]">
                                Use your tracking code to follow an application, or request official certification after a completed CDS Space internship.
                            </p>
                        </div>

                        <div className="mt-8 grid w-full max-w-[760px] gap-4 sm:grid-cols-2 md:mt-10">
                            <div className="rounded-[18px] border border-white/10 bg-white/[0.06] p-5 text-center backdrop-blur-sm md:p-6">
                                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-[14px] bg-white text-brand-blue">
                                    <FileSearch className="h-5 w-5" />
                                </div>
                                <h3 className="text-[19px] font-bold text-white">Check application status</h3>
                                <p className="mt-2 text-[14px] leading-relaxed text-white/64">
                                    See the latest decision stage using your tracking code and email.
                                </p>
                                <button
                                    onClick={() => setShowStatusModal(true)}
                                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-[100px] bg-white px-5 py-3 text-[14px] font-semibold text-brand-navy transition hover:bg-white/90"
                                >
                                    Check Status <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="rounded-[18px] border border-white/10 bg-white/[0.06] p-5 text-center backdrop-blur-sm md:p-6">
                                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-[14px] bg-white text-brand-blue">
                                    <Award className="h-5 w-5" />
                                </div>
                                <h3 className="text-[19px] font-bold text-white">Request certification</h3>
                                <p className="mt-2 text-[14px] leading-relaxed text-white/64">
                                    Past interns can request official internship certification from the team.
                                </p>
                                <button
                                    onClick={() => setShowCertModal(true)}
                                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-[100px] border border-white/25 px-5 py-3 text-[14px] font-semibold text-white transition hover:border-white hover:bg-white/10"
                                >
                                    Request Certificate <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </section>

            {/* Modals */}
            <AnimatePresence>
                {selectedRole && <RoleDetailModal role={selectedRole} onClose={closeSelectedRole} />}
                {showCertModal && <CertRequestModal onClose={() => setShowCertModal(false)} />}
                {showStatusModal && <StatusCheckModal onClose={() => setShowStatusModal(false)} />}
            </AnimatePresence>
        </main>
    );
}

function RoleDetailModal({ role, onClose }: { role: OpenRole; onClose: () => void }) {
    const [isApplying, setIsApplying] = useState(false);
    const [showApplyForm, setShowApplyForm] = useState(false);
    const [submitted, setSubmitted] = useState<{ tracking_code: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [location, setLocation] = useState("");
    const [coverLetter, setCoverLetter] = useState("");
    const [portfolioLink, setPortfolioLink] = useState("");
    const [resumeLink, setResumeLink] = useState("");
    const [workLinks, setWorkLinks] = useState<string[]>([""]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!fullName.trim() || !email.trim()) return;
        setIsApplying(true);

        try {
            const res = await fetch("/api/career/apply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    role_id: role.id,
                    full_name: fullName,
                    email,
                    phone,
                    location,
                    cover_letter: coverLetter,
                    portfolio_link: portfolioLink,
                    resume_link: resumeLink,
                    work_links: workLinks,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error || "Submission failed");
            if (!json.tracking_code) throw new Error("Application submitted, but no tracking code was returned. Please contact CDS Space support.");
            setSubmitted({ tracking_code: json.tracking_code });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setIsApplying(false);
        }
    }

    function copyCode() {
        if (!submitted) return;
        navigator.clipboard.writeText(submitted.tracking_code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-3xl max-w-2xl w-full my-8 shadow-2xl overflow-hidden"
            >
                <div className="px-8 py-6 border-b border-brand-stroke/20 flex items-start justify-between">
                    <div>
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${ROLE_TYPE_COLORS[role.role_type] || "bg-gray-100 text-gray-600"}`}>
                            {ROLE_TYPE_LABELS[role.role_type] || role.role_type}
                        </span>
                        <h2 className="text-2xl font-bold text-brand-navy mt-2">{role.title}</h2>
                        {role.location && <p className="text-[13px] text-brand-body/60 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{role.location}</p>}
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-8 py-6 max-h-[60vh] overflow-y-auto">
                    {submitted ? (
                        <div className="text-center py-6">
                            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                                <Check className="w-8 h-8 text-emerald-500" />
                            </div>
                            <h3 className="text-xl font-bold text-brand-navy mb-2">Application Received</h3>
                            <p className="text-brand-body/60 text-[14px] max-w-sm mx-auto">
                                Your application was submitted successfully. Save this tracking code now. You&apos;ll need it with your email to check your application status.
                            </p>

                            <div className="mt-6 inline-flex flex-col items-center gap-3 p-5 rounded-2xl border border-brand-stroke/40 bg-brand-bg">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-blue">Your Tracking Code</p>
                                <button
                                    onClick={copyCode}
                                    className="flex items-center gap-3 text-2xl font-bold text-brand-navy tracking-widest font-mono hover:text-brand-blue transition"
                                >
                                    {submitted.tracking_code}
                                    {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
                                </button>
                                <p className="text-[11px] font-semibold text-brand-body/60">
                                    {copied ? "Copied. Keep it somewhere safe." : "Tap to copy, then save it somewhere safe."}
                                </p>
                            </div>

                            <p className="text-[12px] text-brand-body/55 mt-6 max-w-sm mx-auto">
                                Do not close this until you have copied or saved your code. You can return to this page anytime and click <span className="font-semibold text-brand-navy">Check Application Status</span>.
                            </p>

                            <button onClick={onClose} className="mt-6 px-6 py-2.5 bg-brand-blue text-white text-[14px] font-medium rounded-full hover:bg-brand-blue/90 transition">
                                I&apos;ve saved my tracking code
                            </button>
                        </div>
                    ) : showApplyForm ? (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Full Name *" value={fullName} onChange={setFullName} required />
                                <Field label="Email *" value={email} onChange={setEmail} type="email" required />
                                <Field label="Phone" value={phone} onChange={setPhone} />
                                <Field label="Location" value={location} onChange={setLocation} />
                            </div>
                            <Field label="Portfolio Link" value={portfolioLink} onChange={setPortfolioLink} placeholder="https://..." />
                            <Field label="Resume Link (Drive/Notion/etc.)" value={resumeLink} onChange={setResumeLink} placeholder="https://..." />

                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Work Sample Links</label>
                                <p className="text-[11px] text-gray-400 mb-2">Submit work as links only - no file uploads</p>
                                {workLinks.map((link, i) => (
                                    <div key={i} className="flex gap-2 mb-2">
                                        <input
                                            type="url"
                                            value={link}
                                            onChange={(e) => {
                                                const updated = [...workLinks];
                                                updated[i] = e.target.value;
                                                setWorkLinks(updated);
                                            }}
                                            placeholder="https://..."
                                            className="flex-1 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                                        />
                                        {workLinks.length > 1 && (
                                            <button type="button" onClick={() => setWorkLinks(workLinks.filter((_, idx) => idx !== i))}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button type="button" onClick={() => setWorkLinks([...workLinks, ""])}
                                    className="text-[12px] text-brand-blue font-medium hover:underline flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> Add another link
                                </button>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Cover Letter</label>
                                <textarea value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} rows={4}
                                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
                            </div>

                            {error && (
                                <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] px-4 py-3">
                                    {error}
                                </div>
                            )}

                            <div className="flex gap-2 pt-2">
                                <button type="submit" disabled={isApplying || !fullName.trim() || !email.trim()}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-brand-blue text-white text-sm font-medium rounded-full hover:bg-brand-blue/90 transition disabled:opacity-50">
                                    {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    {isApplying ? "Submitting..." : "Submit Application"}
                                </button>
                                <button type="button" onClick={() => setShowApplyForm(false)}
                                    className="px-4 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-full hover:bg-gray-50 transition">
                                    Back
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="space-y-6 text-[14px] text-brand-body/80 leading-relaxed">
                            <div>
                                <h4 className="text-[12px] font-semibold uppercase tracking-wider text-brand-mute mb-2">About the role</h4>
                                <FormattedRoleText value={role.description} />
                            </div>
                            <div>
                                <h4 className="text-[12px] font-semibold uppercase tracking-wider text-brand-mute mb-2">Requirements</h4>
                                <FormattedRoleText value={role.requirements} />
                            </div>
                            {role.perks && (
                                <div>
                                    <h4 className="text-[12px] font-semibold uppercase tracking-wider text-brand-mute mb-2">Role-specific perks</h4>
                                    <FormattedRoleText value={role.perks} />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {!showApplyForm && !submitted && (
                    <div className="px-8 py-5 border-t border-brand-stroke/20 flex items-center justify-between gap-3">
                        {role.application_link ? (
                            <a href={role.application_link} target="_blank" rel="noopener noreferrer"
                                className="text-[13px] text-brand-blue font-medium hover:underline flex items-center gap-1">
                                External link <ExternalLink className="w-3 h-3" />
                            </a>
                        ) : <span />}
                        <button onClick={() => setShowApplyForm(true)}
                            className="px-6 py-2.5 bg-brand-blue text-white text-[14px] font-semibold rounded-full hover:bg-brand-blue/90 transition flex items-center gap-2">
                            Apply Now <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}

function StatusCheckModal({ onClose }: { onClose: () => void }) {
    const [code, setCode] = useState("");
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<StatusResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handleCheck(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!code.trim() || !email.trim()) return;
        setLoading(true);
        try {
            const res = await fetch("/api/career/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tracking_code: code, email }),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error || "Lookup failed");
            setResult(json.application);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setLoading(false);
        }
    }

    function reset() {
        setResult(null);
        setCode("");
        setEmail("");
        setError(null);
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-3xl max-w-xl w-full my-8 shadow-2xl overflow-hidden"
            >
                <div className="px-8 py-6 border-b border-brand-stroke/20 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-blue">Application Status</p>
                        <h2 className="text-xl font-bold text-brand-navy mt-1">
                            {result ? "Current Status" : "Check your application"}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-8 py-6 max-h-[70vh] overflow-y-auto">
                    {result ? (
                        <StatusResultView result={result} onCheckAnother={reset} onClose={onClose} />
                    ) : (
                        <form onSubmit={handleCheck} className="space-y-4">
                            <p className="text-[13px] text-brand-body/70">
                                Enter the tracking code you received after applying, along with the email you used.
                            </p>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Tracking Code *</label>
                                <input
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                                    placeholder="CDS-XXXXXX"
                                    required
                                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
                                />
                            </div>
                            <Field label="Email *" value={email} onChange={setEmail} type="email" required placeholder="the email you applied with" />

                            {error && (
                                <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] px-4 py-3 flex items-start gap-2">
                                    <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading || !code.trim() || !email.trim()}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand-blue text-white text-sm font-semibold rounded-full hover:bg-brand-blue/90 transition disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                {loading ? "Checking..." : "Check Status"}
                            </button>
                        </form>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

function StatusResultView({
    result,
    onCheckAnother,
    onClose,
}: {
    result: StatusResult;
    onCheckAnother: () => void;
    onClose: () => void;
}) {
    const meta = STATUS_META[result.status];
    const isRejected = result.status === "rejected";
    const steps = isRejected
        ? ["Received", "Reviewing", "Decision"]
        : ["Received", "Reviewing", "Shortlisted", "Hired"];
    const currentStep = isRejected ? 3 : meta.step;

    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="rounded-2xl border border-brand-stroke/30 p-5 bg-brand-bg">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-body/50">Applicant</p>
                        <p className="text-[16px] font-bold text-brand-navy mt-0.5 truncate">{result.full_name}</p>
                    </div>
                    <span className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md border flex-shrink-0 ${meta.color}`}>
                        {meta.label}
                    </span>
                </div>

                {result.role && (
                    <div className="pt-3 border-t border-brand-stroke/30">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-body/50 mb-1">Applied for</p>
                        <p className="text-[14px] font-semibold text-brand-navy">{result.role.title}</p>
                        <div className="flex items-center gap-3 text-[11px] text-brand-body/60 mt-1">
                            <span className="inline-flex items-center gap-1">
                                <Briefcase className="w-3 h-3" />
                                {ROLE_TYPE_LABELS[result.role.role_type] || result.role.role_type}
                            </span>
                            {result.role.location && (
                                <span className="inline-flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {result.role.location}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                <div className="pt-3 mt-3 border-t border-brand-stroke/30 flex items-center justify-between text-[11px] text-brand-body/50">
                    <span>Tracking: <span className="font-mono font-semibold text-brand-body/70">{result.tracking_code}</span></span>
                    <span>Submitted {new Date(result.created_at).toLocaleDateString()}</span>
                </div>
            </div>

            {/* Tracker */}
            <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-blue mb-3">Progress</p>
                <div className="relative">
                    <div className="absolute left-0 right-0 top-3 h-px bg-brand-stroke/40" />
                    <div
                        className={`absolute left-0 top-3 h-px transition-all duration-500 ${isRejected ? "bg-rose-400" : "bg-brand-blue"}`}
                        style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
                    />
                    <div className="relative flex justify-between">
                        {steps.map((label, i) => {
                            const stepNum = i + 1;
                            const done = stepNum <= currentStep;
                            const isCurrent = stepNum === currentStep;
                            return (
                                <div key={label} className="flex flex-col items-center gap-2" style={{ width: `${100 / steps.length}%` }}>
                                    <div
                                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${done
                                            ? isRejected && stepNum === currentStep
                                                ? "bg-rose-400 border-rose-400 text-white"
                                                : "bg-brand-blue border-brand-blue text-white"
                                            : "bg-white border-brand-stroke"
                                            }`}
                                    >
                                        {done ? <Check className="w-3 h-3" /> : <span className="text-[10px] font-semibold text-brand-body/40">{stepNum}</span>}
                                    </div>
                                    <span className={`text-[10px] font-semibold text-center ${isCurrent ? "text-brand-navy" : "text-brand-body/50"}`}>
                                        {label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Message */}
            <div className={`rounded-2xl p-4 border ${meta.color}`}>
                <p className="text-[13px] leading-relaxed">{meta.message}</p>
                {result.admin_note && (
                    <div className="mt-3 pt-3 border-t border-current/10">
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1 opacity-70">Message from the team</p>
                        <p className="text-[13px] leading-relaxed whitespace-pre-line">{result.admin_note}</p>
                    </div>
                )}
                {result.status_updated_at && (
                    <p className="text-[11px] opacity-60 mt-3">
                        Updated {new Date(result.status_updated_at).toLocaleDateString()}
                    </p>
                )}
            </div>

            <div className="flex gap-2 pt-2">
                <button onClick={onCheckAnother} className="flex-1 px-4 py-2.5 text-sm text-brand-body border border-brand-stroke rounded-full hover:bg-brand-bg transition">
                    Check another
                </button>
                <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-brand-navy text-white text-sm font-semibold rounded-full hover:bg-brand-navy/90 transition">
                    Close
                </button>
            </div>
        </div>
    );
}

function CertRequestModal({ onClose }: { onClose: () => void }) {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [internRole, setInternRole] = useState("");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [supervisor, setSupervisor] = useState("");
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!fullName.trim() || !email.trim() || !internRole.trim()) return;
        setSubmitting(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("cert_requests").insert({
            full_name: fullName.trim(),
            email: email.trim(),
            phone: phone.trim() || null,
            intern_role: internRole.trim(),
            internship_start: start || null,
            internship_end: end || null,
            supervisor_name: supervisor.trim() || null,
            notes: notes.trim() || null,
        });
        setSubmitting(false);
        if (!error) setSubmitted(true);
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-3xl max-w-xl w-full my-8 shadow-2xl overflow-hidden"
            >
                <div className="px-8 py-6 border-b border-brand-stroke/20 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-brand-navy">Request Internship Certification</h2>
                    <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="px-8 py-6 max-h-[70vh] overflow-y-auto">
                    {submitted ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                                <Check className="w-8 h-8 text-emerald-500" />
                            </div>
                            <h3 className="text-xl font-bold text-brand-navy mb-2">Request Received</h3>
                            <p className="text-brand-body/60 text-[14px]">We&apos;ll verify your record and email your certificate within a few days.</p>
                            <button onClick={onClose} className="mt-6 px-6 py-2.5 bg-brand-blue text-white text-[14px] font-medium rounded-full hover:bg-brand-blue/90 transition">
                                Close
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Full Name *" value={fullName} onChange={setFullName} required />
                                <Field label="Email *" value={email} onChange={setEmail} type="email" required />
                                <Field label="Phone" value={phone} onChange={setPhone} />
                                <Field label="Internship Role *" value={internRole} onChange={setInternRole} placeholder="e.g. Brand Designer" required />
                                <Field label="Start Date" value={start} onChange={setStart} type="date" />
                                <Field label="End Date" value={end} onChange={setEnd} type="date" />
                            </div>
                            <Field label="Supervisor Name" value={supervisor} onChange={setSupervisor} />
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
                                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
                            </div>
                            <button type="submit" disabled={submitting || !fullName.trim() || !email.trim() || !internRole.trim()}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand-blue text-white text-sm font-medium rounded-full hover:bg-brand-blue/90 transition disabled:opacity-50">
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                Submit Request
                            </button>
                        </form>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

function Field({ label, value, onChange, placeholder, type = "text", required }: {
    label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
            <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
        </div>
    );
}
