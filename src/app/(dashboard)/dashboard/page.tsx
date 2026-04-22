"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { supabase } from "@/lib/supabase";
import {
    Plus, FileText, Image as ImageIcon, Package, Handshake, Calendar, MessageSquare,
    ShoppingBag, Loader2, ArrowRight, Volume2, Share2, Download,
    X, Check, BookOpen, Clock, FileCheck, Star,
} from "lucide-react";

interface BrandingWord {
    id: string;
    word: string;
    pronunciation: string | null;
    part_of_speech: string | null;
    meaning: string;
    example: string | null;
}

interface PendingJob {
    id: string;
    title: string;
    status: string;
    type: string;
    created_at: string;
}

interface Invoice {
    id: string;
    invoice_number: string;
    total: number;
    currency: string;
    status: string;
    issue_date: string;
}

interface ChatMessage {
    id: string;
    message: string;
    sender_role: string;
    created_at: string;
}

const QUICK_ACTIONS = [
    { label: "Brand Brief", desc: "Define your brand", icon: FileText, href: "/brand-brief", color: "bg-blue-50 text-brand-blue" },
    { label: "New Banner", desc: "Order a banner", icon: ImageIcon, href: "/dashboard/banners", color: "bg-amber-50 text-amber-600" },
    { label: "Order Merch", desc: "Branded items", icon: Package, href: "/dashboard/merch", color: "bg-emerald-50 text-emerald-600" },
    { label: "Partnership", desc: "Earn referrals", icon: Handshake, href: "/partnership", color: "bg-purple-50 text-purple-600" },
];

export default function DashboardPage() {
    const [userName, setUserName] = useState("there");
    const [userId, setUserId] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState("");
    const [word, setWord] = useState<BrandingWord | null>(null);
    const [pendingJobs, setPendingJobs] = useState<PendingJob[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);

    useEffect(() => {
        async function loadData() {
            try {
                const sb = createClient();
                const { data: { user } } = await sb.auth.getUser();
                if (!user) { setIsLoading(false); return; }

                setUserId(user.id);
                setUserEmail(user.email || "");
                const name = user.user_metadata?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "there";
                setUserName(name);

                // Fetch word of the day (rotates by day index)
                const { data: words } = await supabase.from("branding_words").select("*");
                if (words && words.length > 0) {
                    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % words.length;
                    setWord(words[dayIndex]);
                }

                // Fetch pending jobs (designs + banners)
                const [designsRes, bannersRes] = await Promise.all([
                    supabase.from("design_requests").select("id, title, status, created_at").eq("user_id", user.id).neq("status", "COMPLETED").order("created_at", { ascending: false }).limit(5),
                    supabase.from("banner_requests").select("id, title, status, created_at").eq("user_id", user.id).neq("status", "COMPLETED").order("created_at", { ascending: false }).limit(5),
                ]);
                const jobs = [
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ...(((designsRes.data as any[]) || []).map((d: any) => ({ ...d, type: "design" }))),
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ...(((bannersRes.data as any[]) || []).map((b: any) => ({ ...b, type: "banner" }))),
                ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);
                setPendingJobs(jobs);

                // Fetch invoices
                const { data: invs } = await supabase.from("finance_invoices").select("id, invoice_number, total, currency, status, issue_date").eq("client_email", user.email || "").order("issue_date", { ascending: false }).limit(5);
                setInvoices(invs || []);

                // Fetch recent messages
                const { data: msgs } = await supabase.from("chat_messages").select("id, message, sender_role, created_at").eq("room_id", `client_${user.id}`).order("created_at", { ascending: false }).limit(5);
                setMessages(msgs || []);
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        }
        loadData();
    }, []);

    const speak = (text: string) => {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        }
    };

    const shareWord = (platform: string) => {
        if (!word) return;
        const text = `📚 Branding Word of the Day: ${word.word}\n${word.pronunciation || ""}\n\n${word.meaning}\n\n— from CDS Space`;
        const encoded = encodeURIComponent(text);
        const urls: Record<string, string> = {
            whatsapp: `https://wa.me/?text=${encoded}`,
            facebook: `https://www.facebook.com/sharer/sharer.php?u=https://cdsspace.pro&quote=${encoded}`,
            twitter: `https://twitter.com/intent/tweet?text=${encoded}`,
            linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=https://cdsspace.pro&summary=${encoded}`,
            telegram: `https://t.me/share/url?url=https://cdsspace.pro&text=${encoded}`,
        };
        if (urls[platform]) window.open(urls[platform], "_blank");
        setShowShareMenu(false);
    };

    const downloadCard = async () => {
        if (!word) return;
        // Generate a card image via canvas
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1080;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Background gradient
        const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
        gradient.addColorStop(0, "#0035C1");
        gradient.addColorStop(1, "#0575FF");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1080, 1080);

        // Subtle pattern
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        for (let x = 0; x < 1080; x += 60) {
            for (let y = 0; y < 1080; y += 60) {
                ctx.beginPath();
                ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Header label
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "bold 28px sans-serif";
        ctx.fillText("BRANDING WORD OF THE DAY", 80, 130);

        // Word
        ctx.fillStyle = "white";
        ctx.font = "bold 96px sans-serif";
        ctx.fillText(word.word, 80, 270);

        // Pronunciation
        if (word.pronunciation) {
            ctx.fillStyle = "rgba(255,255,255,0.6)";
            ctx.font = "italic 36px sans-serif";
            ctx.fillText(word.pronunciation, 80, 330);
        }

        // Meaning (wrap text)
        ctx.fillStyle = "white";
        ctx.font = "44px sans-serif";
        const words = word.meaning.split(" ");
        let line = "";
        let y = 460;
        for (const w of words) {
            const test = line + w + " ";
            if (ctx.measureText(test).width > 920 && line) {
                ctx.fillText(line, 80, y);
                line = w + " ";
                y += 60;
            } else {
                line = test;
            }
        }
        ctx.fillText(line, 80, y);

        // Footer
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "bold 32px sans-serif";
        ctx.fillText("CDS Space", 80, 1000);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "26px sans-serif";
        ctx.fillText("cdsspace.pro", 80, 1040);

        const link = document.createElement("a");
        link.download = `cds-word-${word.word.toLowerCase().replace(/\s+/g, "-")}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    };

    return (
        <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
            {/* Welcome */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                <p className="text-brand-blue text-sm font-semibold">Welcome back, {userName}! 👋</p>
                <h1 className="text-[28px] lg:text-[34px] font-bold text-brand-navy tracking-tight">Dashboard</h1>
                <p className="text-gray-500 text-sm mt-1">Your hub for everything CDS Space.</p>
            </motion.div>

            {/* Quick Actions */}
            <div className="mb-8">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {QUICK_ACTIONS.map((a, i) => (
                        <motion.div key={a.label}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                        >
                            <Link href={a.href} className="group block bg-white/80 backdrop-blur-xl border border-white/70 rounded-2xl shadow-[0_10px_40px_rgba(15,40,90,0.05)] p-5 hover:border-brand-blue/30 hover:shadow-[0_8px_30px_rgba(0,53,193,0.06)] transition-all">
                                <div className={`w-10 h-10 rounded-xl ${a.color} flex items-center justify-center mb-3 group-hover:scale-110 transition`}>
                                    <a.icon className="w-5 h-5" />
                                </div>
                                <p className="text-sm font-semibold text-brand-navy">{a.label}</p>
                                <p className="text-[11px] text-brand-body/50 mt-0.5">{a.desc}</p>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Top Row: Word of Day + Book Session */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
                {/* Word of the Day - takes 2 cols */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="lg:col-span-2 relative bg-gradient-to-br from-[#0035C1] to-[#0575FF] rounded-2xl p-7 lg:p-8 text-white overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-300/20 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-blue-400/10 rounded-full blur-2xl pointer-events-none" />

                    <div className="relative">
                        <div className="flex items-center gap-2 mb-3">
                            <BookOpen className="w-4 h-4" />
                            <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">Branding Word of the Day</span>
                        </div>

                        {word ? (
                            <>
                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                    <h2 className="text-[36px] lg:text-[44px] font-bold leading-tight">{word.word}</h2>
                                    <button onClick={() => speak(word.word)}
                                        className="p-2 rounded-full bg-white/15 hover:bg-white/25 transition" title="Pronounce">
                                        <Volume2 className="w-4 h-4" />
                                    </button>
                                </div>
                                {word.pronunciation && <p className="text-[14px] italic text-white/70 mb-3">{word.pronunciation} {word.part_of_speech && `· ${word.part_of_speech}`}</p>}
                                <p className="text-[15px] text-white/90 leading-relaxed mb-3 max-w-[520px]">{word.meaning}</p>
                                {word.example && <p className="text-[12px] text-white/60 italic mb-5 max-w-[520px]">"{word.example}"</p>}

                                <div className="flex items-center gap-2 flex-wrap">
                                    <button onClick={downloadCard}
                                        className="flex items-center gap-2 px-4 py-2 bg-white text-brand-navy rounded-full text-[12px] font-semibold hover:bg-white/90 transition">
                                        <Download className="w-3.5 h-3.5" /> Save Card
                                    </button>
                                    <button onClick={() => setShowShareMenu(!showShareMenu)}
                                        className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 rounded-full text-[12px] font-semibold transition">
                                        <Share2 className="w-3.5 h-3.5" /> Share
                                    </button>
                                    {showShareMenu && (
                                        <motion.div
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="flex items-center gap-1.5 flex-wrap bg-white rounded-full p-1.5 shadow-lg"
                                        >
                                            {[
                                                { key: "whatsapp", label: "WhatsApp", color: "bg-green-500" },
                                                { key: "facebook", label: "Facebook", color: "bg-blue-600" },
                                                { key: "twitter", label: "X", color: "bg-black" },
                                                { key: "linkedin", label: "LinkedIn", color: "bg-blue-700" },
                                                { key: "telegram", label: "Telegram", color: "bg-sky-500" },
                                            ].map(p => (
                                                <button key={p.key} onClick={() => shareWord(p.key)}
                                                    className={`${p.color} text-white text-[11px] font-semibold px-3 py-1.5 rounded-full hover:opacity-90 transition`}>
                                                    {p.label}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="py-8"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>
                        )}
                    </div>
                </motion.div>

                {/* Book Session */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white/80 backdrop-blur-xl border border-white/70 rounded-2xl shadow-[0_10px_40px_rgba(15,40,90,0.05)] p-7 flex flex-col"
                >
                    <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
                        <Calendar className="w-6 h-6 text-amber-600" />
                    </div>
                    <h3 className="text-[20px] font-bold text-brand-navy mb-2">Book a Session</h3>
                    <p className="text-[13px] text-brand-body/60 leading-relaxed mb-6 flex-1">
                        Have something on your mind? Schedule a 1-on-1 with our team to talk strategy, design, or growth.
                    </p>
                    <button onClick={() => setShowBookingModal(true)}
                        className="flex items-center justify-center gap-2 px-5 py-3 bg-brand-blue text-white text-[13px] font-semibold rounded-xl hover:bg-brand-blue/90 transition">
                        <Calendar className="w-4 h-4" /> Schedule Now
                    </button>
                </motion.div>
            </div>

            {/* Three Column Data Widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Pending Jobs */}
                <Widget title="Pending Jobs" icon={<Clock className="w-4 h-4 text-amber-500" />} viewAllHref="/dashboard/orders" delay={0.15}>
                    {isLoading ? (
                        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-blue/40" /></div>
                    ) : pendingJobs.length === 0 ? (
                        <EmptyState icon={<ShoppingBag className="w-7 h-7 text-brand-stroke/40" />} text="No active jobs" />
                    ) : (
                        <div className="space-y-2">
                            {pendingJobs.map(j => (
                                <div key={`${j.type}-${j.id}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#F5F7FA]/50 transition">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${j.type === "banner" ? "bg-amber-50" : "bg-blue-50"}`}>
                                        {j.type === "banner" ? <ImageIcon className="w-4 h-4 text-amber-600" /> : <FileText className="w-4 h-4 text-brand-blue" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-medium text-brand-navy truncate">{j.title}</p>
                                        <p className="text-[10px] text-brand-body/50">{j.status.replace("_", " ")}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Widget>

                {/* Past Invoices */}
                <Widget title="Past Invoices" icon={<FileCheck className="w-4 h-4 text-emerald-500" />} viewAllHref="/dashboard/invoices" delay={0.2}>
                    {isLoading ? (
                        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-blue/40" /></div>
                    ) : invoices.length === 0 ? (
                        <EmptyState icon={<FileCheck className="w-7 h-7 text-brand-stroke/40" />} text="No invoices yet" />
                    ) : (
                        <div className="space-y-2">
                            {invoices.map(inv => (
                                <div key={inv.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#F5F7FA]/50 transition">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-medium text-brand-navy truncate">{inv.invoice_number}</p>
                                        <p className="text-[10px] text-brand-body/50">{new Date(inv.issue_date).toLocaleDateString()}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[12px] font-semibold tabular-nums text-brand-navy">{inv.currency} {Number(inv.total).toLocaleString()}</p>
                                        <p className={`text-[9px] font-bold uppercase tracking-wider ${inv.status === "paid" ? "text-emerald-500" : "text-amber-500"}`}>{inv.status}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Widget>

                {/* Recent Messages */}
                <Widget title="Recent Messages" icon={<MessageSquare className="w-4 h-4 text-brand-blue" />} viewAllHref="/dashboard/messages" delay={0.25}>
                    {isLoading ? (
                        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-blue/40" /></div>
                    ) : messages.length === 0 ? (
                        <EmptyState icon={<MessageSquare className="w-7 h-7 text-brand-stroke/40" />} text="No messages" />
                    ) : (
                        <div className="space-y-2">
                            {messages.map(m => (
                                <div key={m.id} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-[#F5F7FA]/50 transition">
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${m.sender_role === "admin" ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-500"}`}>
                                        {m.sender_role === "admin" ? "C" : "Y"}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12px] text-brand-navy line-clamp-2">{m.message}</p>
                                        <p className="text-[10px] text-brand-body/40 mt-0.5">{new Date(m.created_at).toLocaleString()}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Widget>
            </div>

            {/* Booking Modal */}
            {showBookingModal && userId && (
                <BookingModal
                    userId={userId}
                    userEmail={userEmail}
                    userName={userName}
                    onClose={() => setShowBookingModal(false)}
                />
            )}
        </div>
    );
}

function Widget({ title, icon, viewAllHref, children, delay }: { title: string; icon: React.ReactNode; viewAllHref?: string; children: React.ReactNode; delay?: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className="bg-white/80 backdrop-blur-xl border border-white/70 rounded-2xl shadow-[0_10px_40px_rgba(15,40,90,0.05)] overflow-hidden"
        >
            <div className="px-5 py-4 border-b border-brand-stroke/10 flex items-center justify-between">
                <h3 className="font-semibold text-[14px] text-brand-navy flex items-center gap-2">
                    {icon} {title}
                </h3>
                {viewAllHref && (
                    <Link href={viewAllHref} className="text-[11px] text-brand-blue hover:underline font-medium">View all</Link>
                )}
            </div>
            <div className="p-3">
                {children}
            </div>
        </motion.div>
    );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="py-8 text-center">
            <div className="flex justify-center mb-2">{icon}</div>
            <p className="text-[12px] text-brand-body/40">{text}</p>
        </div>
    );
}

function BookingModal({ userId, userEmail, userName, onClose }: { userId: string; userEmail: string; userName: string; onClose: () => void }) {
    const [fullName, setFullName] = useState(userName);
    const [email, setEmail] = useState(userEmail);
    const [phone, setPhone] = useState("");
    const [topic, setTopic] = useState("");
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [duration, setDuration] = useState("30 min");
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!fullName.trim() || !email.trim() || !topic.trim() || !date) return;
        setSubmitting(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("booking_sessions").insert({
            user_id: userId,
            full_name: fullName.trim(),
            email: email.trim(),
            phone: phone.trim() || null,
            topic: topic.trim(),
            preferred_date: date,
            preferred_time: time || null,
            duration,
            notes: notes.trim() || null,
        });
        setSubmitting(false);
        if (!error) setSubmitted(true);
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-brand-navy flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-amber-600" /> Book a Session
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>
                <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
                    {submitted ? (
                        <div className="text-center py-6">
                            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                                <Check className="w-8 h-8 text-emerald-500" />
                            </div>
                            <h3 className="text-xl font-bold text-brand-navy mb-2">Session Requested</h3>
                            <p className="text-sm text-brand-body/60">We'll confirm your session shortly via email.</p>
                            <button onClick={onClose} className="mt-6 px-6 py-2.5 bg-brand-blue text-white text-sm font-semibold rounded-full hover:bg-brand-blue/90 transition">
                                Close
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <Input label="Full Name *" value={fullName} onChange={setFullName} />
                                <Input label="Email *" value={email} onChange={setEmail} type="email" />
                                <Input label="Phone" value={phone} onChange={setPhone} />
                                <div>
                                    <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Duration</label>
                                    <select value={duration} onChange={(e) => setDuration(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300">
                                        <option>15 min</option>
                                        <option>30 min</option>
                                        <option>60 min</option>
                                    </select>
                                </div>
                            </div>
                            <Input label="Topic *" value={topic} onChange={setTopic} placeholder="What do you want to discuss?" />
                            <div className="grid grid-cols-2 gap-3">
                                <Input label="Preferred Date *" value={date} onChange={setDate} type="date" />
                                <Input label="Preferred Time" value={time} onChange={setTime} type="time" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Notes</label>
                                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                                    className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
                            </div>
                            <button type="submit" disabled={submitting || !fullName.trim() || !email.trim() || !topic.trim() || !date}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand-blue text-white text-sm font-semibold rounded-full hover:bg-brand-blue/90 transition disabled:opacity-50">
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                                {submitting ? "Booking..." : "Book Session"}
                            </button>
                        </form>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

function Input({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
    return (
        <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">{label}</label>
            <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
        </div>
    );
}
