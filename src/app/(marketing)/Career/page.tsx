"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import FormattedRoleText from "@/components/hrm/FormattedRoleText";
import {
    Briefcase, MapPin, Clock, ArrowRight, PartyPopper, Users, Wifi, Calendar,
    Heart, Coffee, GraduationCap, Award, Loader2, ExternalLink, X, Check, Plus,
    UserPlus, Search, Copy, CheckCircle2, FileSearch, Sparkles, ShieldCheck,
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
    { icon: GraduationCap, title: "Mentorship", desc: "Learn directly from senior creatives and engineers who've shaped iconic brands." },
    { icon: Coffee, title: "Calm Working Space", desc: "A serene, well-lit studio designed for deep work and creative flow." },
    { icon: Wifi, title: "High-Speed Connectivity", desc: "Reliable, blazing-fast internet so nothing slows down your output." },
    { icon: Users, title: "Like-Minded Creatives", desc: "Surround yourself with passionate, talented people who push each other forward." },
    { icon: Calendar, title: "Flexible Work Schedule", desc: "Work in rhythms that fit you — async-friendly with respectful core hours." },
    { icon: Heart, title: "Faith-Sensitive Workplace", desc: "A respectful, inclusive environment where personal beliefs are honoured." },
    { icon: PartyPopper, title: "Fun & Playful Timeouts", desc: "Game nights, retreats, and team activities that recharge and bond us." },
    { icon: Award, title: "World-Class Standards", desc: "We work with the best of the best — and you'll learn how to match those standards at every level." },
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
    shortlisted: { label: "Shortlisted", color: "bg-emerald-50 text-emerald-700 border-emerald-200", step: 3, message: "Good news — you've been shortlisted. Expect to hear from us soon." },
    hired: { label: "Hired", color: "bg-emerald-100 text-emerald-800 border-emerald-300", step: 4, message: "Welcome to the team!" },
    rejected: { label: "Not a Fit", color: "bg-rose-50 text-rose-700 border-rose-200", step: 4, message: "Thank you for applying. We won't be moving forward at this time." },
};

export default function CareerPage() {
    const [roles, setRoles] = useState<OpenRole[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [selectedRole, setSelectedRole] = useState<OpenRole | null>(null);
    const [showCertModal, setShowCertModal] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);

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

    const filtered = useMemo(
        () => (filter === "all" ? roles : roles.filter(r => r.role_type === filter)),
        [roles, filter]
    );

    const counts = useMemo(() => {
        const c: Record<string, number> = { all: roles.length };
        roles.forEach(r => { c[r.role_type] = (c[r.role_type] || 0) + 1; });
        return c;
    }, [roles]);

    return (
        <main className="min-h-screen bg-brand-bg">
            {/* Hero */}
            <section className="relative overflow-hidden pt-32 md:pt-40 pb-20 md:pb-24">
                <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-brand-blue/5 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute top-20 right-10 w-40 h-40 bg-brand-blue/10 rounded-full blur-3xl pointer-events-none" />

                <div className="section-container relative">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="max-w-3xl mx-auto text-center"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-blue/5 text-brand-blue text-xs font-bold tracking-wider uppercase mb-6">
                            <UserPlus className="w-3.5 h-3.5" />
                            Now Welcoming Talent & Interns
                        </div>
                        <h1 className="text-[40px] md:text-[56px] lg:text-[64px] font-bold text-brand-navy leading-[1.05] tracking-tight">
                            Build your career at <span className="text-brand-blue">CDS Space</span>
                        </h1>
                        <p className="text-[16px] md:text-[18px] text-brand-body/70 mt-6 leading-relaxed max-w-2xl mx-auto">
                            We work with the best of the best — and our team members get to learn how to match those standards at every level. Join a unicorn studio shaping global brands.
                        </p>

                        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                            <a
                                href="#open-roles"
                                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-blue text-white text-[14px] font-semibold rounded-full hover:bg-brand-blue/90 transition shadow-[0_12px_30px_rgba(28,78,209,0.25)]"
                            >
                                View Open Roles <ArrowRight className="w-4 h-4" />
                            </a>
                            <button
                                onClick={() => setShowStatusModal(true)}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-brand-navy text-[14px] font-semibold rounded-full border border-brand-stroke hover:border-brand-blue/40 hover:text-brand-blue transition"
                            >
                                <FileSearch className="w-4 h-4" />
                                Check Application Status
                            </button>
                        </div>

                        {/* Quick stats */}
                        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[12px] text-brand-body/60">
                            <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-brand-blue" /> Global-standard projects</span>
                            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-brand-blue" /> Faith-sensitive workplace</span>
                            <span className="inline-flex items-center gap-1.5"><Award className="w-3.5 h-3.5 text-brand-blue" /> Intern certification</span>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Perks */}
            <section className="pb-20 md:pb-28">
                <div className="section-container">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12 md:mb-16"
                    >
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-blue mb-3">Why join us</p>
                        <h2 className="text-[28px] md:text-[40px] font-bold text-brand-navy tracking-tight">More than a job. A creative home.</h2>
                    </motion.div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
                        {PERKS.map((perk, i) => {
                            const Icon = perk.icon;
                            return (
                                <motion.div
                                    key={perk.title}
                                    initial={{ opacity: 0, y: 30 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.4, delay: i * 0.05 }}
                                    className="bg-white rounded-2xl p-6 border border-brand-stroke/20 hover:border-brand-blue/30 hover:shadow-[0_20px_40px_rgba(0,53,193,0.06)] transition-all duration-300 group"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-brand-blue/10 flex items-center justify-center mb-4 group-hover:bg-brand-blue group-hover:scale-110 transition-all duration-300">
                                        <Icon className="w-5 h-5 text-brand-blue group-hover:text-white transition-colors" />
                                    </div>
                                    <h3 className="text-[15px] font-semibold text-brand-navy mb-1.5">{perk.title}</h3>
                                    <p className="text-[13px] text-brand-body/60 leading-relaxed">{perk.desc}</p>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Open Roles */}
            <section id="open-roles" className="pb-20 md:pb-28 scroll-mt-24">
                <div className="section-container">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-10"
                    >
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-blue mb-3">Open Positions</p>
                        <h2 className="text-[28px] md:text-[40px] font-bold text-brand-navy tracking-tight">Find your fit</h2>
                        <p className="text-brand-body/60 mt-2 text-[15px]">Full-time roles and internships across design, engineering, and strategy.</p>
                    </motion.div>

                    {/* Filter chips */}
                    {!isLoading && roles.length > 0 && (
                        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
                            {FILTERS.map(f => {
                                const count = counts[f.id] || 0;
                                const isActive = filter === f.id;
                                const isDisabled = f.id !== "all" && count === 0;
                                return (
                                    <button
                                        key={f.id}
                                        onClick={() => !isDisabled && setFilter(f.id)}
                                        disabled={isDisabled}
                                        className={`px-4 py-2 rounded-full text-[13px] font-medium border transition ${isActive
                                            ? "bg-brand-navy text-white border-brand-navy"
                                            : isDisabled
                                                ? "bg-white/50 text-brand-body/30 border-brand-stroke/30 cursor-not-allowed"
                                                : "bg-white text-brand-body border-brand-stroke/40 hover:border-brand-blue/40 hover:text-brand-blue"
                                            }`}
                                    >
                                        {f.label}
                                        <span className={`ml-2 text-[11px] ${isActive ? "text-white/70" : "text-brand-body/40"}`}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="max-w-4xl mx-auto">
                        {isLoading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="text-center py-16 bg-white rounded-2xl border border-brand-stroke/20">
                                <Briefcase className="w-12 h-12 text-brand-stroke/40 mx-auto mb-4" />
                                <p className="text-brand-body/60 text-[15px] font-medium">
                                    {roles.length === 0 ? "No open positions right now" : "No roles match this filter"}
                                </p>
                                <p className="text-brand-body/40 text-[13px] mt-1">
                                    {roles.length === 0 ? "Check back soon — we're always growing." : "Try another category, or view all roles."}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filtered.map((role, i) => (
                                    <motion.button
                                        key={role.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.05 }}
                                        onClick={() => setSelectedRole(role)}
                                        className="w-full text-left bg-white rounded-2xl p-6 border border-brand-stroke/20 hover:border-brand-blue/40 hover:shadow-lg transition-all duration-300 group"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                    <h3 className="text-[18px] font-bold text-brand-navy group-hover:text-brand-blue transition">{role.title}</h3>
                                                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${ROLE_TYPE_COLORS[role.role_type] || "bg-gray-100 text-gray-600"}`}>
                                                        {ROLE_TYPE_LABELS[role.role_type] || role.role_type}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4 text-[12px] text-brand-body/60 flex-wrap">
                                                    {role.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{role.location}</span>}
                                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Posted {new Date(role.created_at).toLocaleDateString()}</span>
                                                </div>
                                                <p className="text-[13px] text-brand-body/70 mt-3 line-clamp-2">{role.description}</p>
                                            </div>
                                            <ArrowRight className="w-5 h-5 text-brand-stroke group-hover:text-brand-blue group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
                                        </div>
                                    </motion.button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Status check banner */}
            <section className="pb-20 md:pb-24">
                <div className="section-container">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="max-w-4xl mx-auto rounded-3xl border border-brand-stroke/30 bg-white p-8 md:p-10 flex flex-col md:flex-row items-center gap-6"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                            <FileSearch className="w-6 h-6 text-brand-blue" />
                        </div>
                        <div className="flex-1 text-center md:text-left">
                            <h3 className="text-[18px] md:text-[20px] font-bold text-brand-navy">Already applied?</h3>
                            <p className="text-[14px] text-brand-body/70 mt-1">
                                Check the status of your application anytime using the tracking code we sent you.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowStatusModal(true)}
                            className="px-5 py-2.5 bg-brand-navy text-white text-[14px] font-semibold rounded-full hover:bg-brand-navy/90 transition flex items-center gap-2 flex-shrink-0"
                        >
                            Check Status <ArrowRight className="w-4 h-4" />
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* Intern certificate */}
            <section className="pb-20 md:pb-28">
                <div className="section-container">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="max-w-3xl mx-auto bg-gradient-to-br from-[#040B37] to-[#0035C1] rounded-3xl p-8 md:p-12 text-white text-center relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
                        <div className="relative">
                            <Award className="w-12 h-12 mx-auto mb-4 text-blue-300" />
                            <h2 className="text-[24px] md:text-[32px] font-bold mb-3">Past intern? Get your certificate</h2>
                            <p className="text-white/70 text-[15px] max-w-xl mx-auto mb-6">
                                If you completed an internship at CDS Space, request your official internship certification here.
                            </p>
                            <button
                                onClick={() => setShowCertModal(true)}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-brand-navy text-[14px] font-semibold rounded-full hover:bg-white/90 transition"
                            >
                                Request Certification <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Modals */}
            <AnimatePresence>
                {selectedRole && <RoleDetailModal role={selectedRole} onClose={() => setSelectedRole(null)} />}
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
            setSubmitted({ tracking_code: json.tracking_code });
        } catch (err: any) {
            setError(err.message || "Something went wrong");
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
                                Save this tracking code to check your application status anytime.
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
                                <p className="text-[11px] text-brand-body/50">Tap to copy</p>
                            </div>

                            <p className="text-[12px] text-brand-body/50 mt-6 max-w-sm mx-auto">
                                We'll also email updates as your status changes. You can return to this page anytime and click <span className="font-semibold text-brand-navy">Check Application Status</span>.
                            </p>

                            <button onClick={onClose} className="mt-6 px-6 py-2.5 bg-brand-blue text-white text-[14px] font-medium rounded-full hover:bg-brand-blue/90 transition">
                                Done
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
                                <p className="text-[11px] text-gray-400 mb-2">Submit work as links only — no file uploads</p>
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
        } catch (err: any) {
            setError(err.message || "Something went wrong");
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
                            <p className="text-brand-body/60 text-[14px]">We'll verify your record and email your certificate within a few days.</p>
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
