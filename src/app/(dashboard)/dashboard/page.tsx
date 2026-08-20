"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useClientAccount } from "@/components/dashboard/ClientAccountProvider";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import { formatFinanceDate } from "@/lib/finance/types";
import { BRANDING_WOTD_BLUE, getBrandingWordDateKey } from "@/lib/branding-word-of-day";
import {
    Plus, FileText, Image as ImageIcon, Package, Calendar, MessageSquare,
    ShoppingBag, Loader2, ArrowRight, Volume2, Download,
    X, Check, BookOpen, Clock, FileCheck, Star,
} from "lucide-react";

interface BrandingWord {
    id: string;
    word: string;
    pronunciation: string | null;
    part_of_speech: string | null;
    meaning: string;
    example: string | null;
    feature_date?: string | null;
    created_at?: string | null;
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

interface RecentDelivery {
    id: string;
    title: string;
    description: string | null;
    delivery_type: "brand_identity" | "design";
    published_at: string;
    file_count: number;
    url: string;
}

const INSTANT_WOTD_FALLBACK: BrandingWord = {
    id: "instant-branding-word",
    word: "Identity",
    pronunciation: "/aɪˈdɛntɪti/",
    part_of_speech: "noun",
    meaning: "The distinctive visual and verbal system that makes a brand recognisable and memorable.",
    example: "A consistent identity helps customers recognise the brand at every touchpoint.",
};

const WOTD_CACHE_KEY = "cds.dashboard.wotd";

const QUICK_ACTIONS = [
    { label: "Brand Brief", desc: "Define your brand", icon: FileText, href: "/dashboard/brand-brief", color: "bg-blue-50 text-brand-blue" },
    { label: "New Banner", desc: "Order a banner", icon: ImageIcon, href: "/dashboard/banners", color: "bg-amber-50 text-amber-600" },
    { label: "Order Merch", desc: "Branded items", icon: Package, href: "/dashboard/merch", color: "bg-emerald-50 text-emerald-600" },
    { label: "Brand Identity", desc: "View your identity", icon: FileCheck, href: "/dashboard/brand-identity", color: "bg-purple-50 text-purple-600" },
];

const SPEECH_LOCALES: Record<string, string> = {
    en: "en-US",
    fr: "fr-FR",
    es: "es-ES",
    pt: "pt-PT",
    ar: "ar-SA",
    de: "de-DE",
    zh: "zh-CN",
    ru: "ru-RU",
    nl: "nl-NL",
};

export default function DashboardPage() {
    const { account, dashboardPath } = useClientAccount();
    const userId = account.userId;
    const userEmail = account.email;
    const userName = account.fullName?.split(" ")[0] || account.email.split("@")[0] || "there";
    const [word, setWord] = useState<BrandingWord>(INSTANT_WOTD_FALLBACK);
    const [pendingJobs, setPendingJobs] = useState<PendingJob[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [recentDeliveries, setRecentDeliveries] = useState<RecentDelivery[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showBookingModal, setShowBookingModal] = useState(false);
    const wordHeadingRef = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        // Fast account data - renders the dashboard immediately, never blocked
        // by the slow (image-generating, up to 2min) Word of the Day request.
        async function loadCore() {
            try {
                const [designsRes, bannersRes, invsRes, msgsRes, deliveriesRes] = await Promise.all([
                    supabase.from("design_requests").select("id, title, status, created_at").eq("user_id", userId).neq("status", "COMPLETED").order("created_at", { ascending: false }).limit(5),
                    supabase.from("banner_requests").select("id, title, status, created_at").eq("user_id", userId).neq("status", "COMPLETED").order("created_at", { ascending: false }).limit(5),
                    supabase.from("finance_invoices").select("id, invoice_number, total, currency, status, issue_date").eq("user_id", userId).order("issue_date", { ascending: false }).limit(5),
                    supabase.from("chat_messages").select("id, message, sender_role, created_at").eq("room_id", `client_${userId}`).order("created_at", { ascending: false }).limit(5),
                    fetch("/api/client/deliveries/recent", { cache: "no-store" }),
                ]);
                const jobs = [
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ...(((designsRes.data as any[]) || []).map((d: any) => ({ ...d, type: "design" }))),
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ...(((bannersRes.data as any[]) || []).map((b: any) => ({ ...b, type: "banner" }))),
                ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);
                setPendingJobs(jobs);
                setInvoices(invsRes.data || []);
                setMessages(msgsRes.data || []);
                const deliveryPayload = await deliveriesRes.json().catch(() => ({}));
                if (deliveriesRes.ok) setRecentDeliveries(deliveryPayload.deliveries || []);
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        }

        // Word of the Day uses a lightweight read endpoint. Print artwork and
        // scheduled-content generation run separately and never block the card.
        async function loadWord() {
            try {
                const cached = localStorage.getItem(WOTD_CACHE_KEY);
                if (cached) {
                    const parsed = JSON.parse(cached) as { date: string; word: BrandingWord };
                    const today = getBrandingWordDateKey();
                    if (parsed.date === today && parsed.word?.word) setWord(parsed.word);
                }
                const res = await fetch("/api/branding-word-of-the-day/print", { cache: "no-store" });
                const data = res.ok ? await res.json() : null;
                if (data?.ok && data.word) {
                    setWord(data.word);
                    localStorage.setItem(WOTD_CACHE_KEY, JSON.stringify({ date: data.date_key, word: data.word }));
                }
            } catch { /* the immediate word keeps the complete card visible */ }
        }

        loadCore();
        loadWord();
    }, [userId]);

    const speak = async (sourceText: string) => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

        const selectedLanguage = (localStorage.getItem("cds.lang") || document.documentElement.lang || "en")
            .toLowerCase()
            .split(/[-_]/)[0];
        const speechLocale = SPEECH_LOCALES[selectedLanguage] || selectedLanguage || "en-US";
        const visibleText = wordHeadingRef.current?.textContent?.trim();
        let spokenText = visibleText || sourceText;

        // The DOM translation normally makes the heading available immediately.
        // If the user presses play before that finishes, translate this word now
        // so the voice and the spoken content still match the selected language.
        if (selectedLanguage !== "en" && (!visibleText || visibleText === sourceText)) {
            try {
                const response = await fetch("/api/translate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ q: [sourceText], source: "en", target: selectedLanguage }),
                });
                const data = response.ok ? await response.json() : null;
                const translated = data?.translations?.[0];
                if (typeof translated === "string" && translated.trim()) spokenText = translated.trim();
            } catch {
                // Keep the visible/source word as the offline fallback.
            }
        }

        const utterance = new SpeechSynthesisUtterance(spokenText);
        utterance.lang = speechLocale;
        utterance.rate = 0.9;

        const voices = window.speechSynthesis.getVoices();
        const exactVoice = voices.find((voice) => voice.lang.toLowerCase() === speechLocale.toLowerCase());
        const languageVoice = voices.find((voice) => voice.lang.toLowerCase().split(/[-_]/)[0] === selectedLanguage);
        utterance.voice = exactVoice || languageVoice || null;

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    };

    const downloadCard = async () => {
        if (!word) return;
        // Generate a card image via canvas
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1080;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Use the brand font (Neue Campton) that next/font already loaded on the
        // page. Read its resolved family off <body>, and make sure the weights +
        // italic the card uses are ready before drawing (canvas draws sync).
        const fam = getComputedStyle(document.body).fontFamily || "sans-serif";
        const primary = fam.split(",")[0].trim() || "sans-serif";
        try {
            await Promise.all([
                document.fonts.load(`400 44px ${primary}`),
                document.fonts.load(`700 96px ${primary}`),
                document.fonts.load(`italic 400 36px ${primary}`),
            ]);
        } catch { /* fall back to whatever's available */ }

        // Solid WOTD print background.
        ctx.fillStyle = BRANDING_WOTD_BLUE;
        ctx.fillRect(0, 0, 1080, 1080);

        // Header label
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = `bold 28px ${fam}`;
        ctx.fillText("BRANDING WORD OF THE DAY", 80, 130);

        // Word
        ctx.fillStyle = "white";
        ctx.font = `bold 96px ${fam}`;
        ctx.fillText(word.word, 80, 270);

        // Pronunciation
        if (word.pronunciation) {
            ctx.fillStyle = "rgba(255,255,255,0.6)";
            ctx.font = `italic 36px ${fam}`;
            ctx.fillText(word.pronunciation, 80, 330);
        }

        // Meaning (wrap text)
        ctx.fillStyle = "white";
        ctx.font = `44px ${fam}`;
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
        ctx.font = `bold 32px ${fam}`;
        ctx.fillText("CDS Space", 80, 1000);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = `26px ${fam}`;
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
                            <Link href={dashboardPath(a.href)} className="group block bg-white/80 backdrop-blur-xl border border-white/70 rounded-2xl shadow-[0_10px_40px_rgba(15,40,90,0.05)] p-5 hover:border-brand-blue/30 hover:shadow-[0_8px_30px_rgba(0,53,193,0.06)] transition-all">
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

            {/* Recent Deliveries */}
            <section className="mb-8 rounded-2xl border border-white/70 bg-white/80 p-5 shadow-[0_10px_40px_rgba(15,40,90,0.05)] backdrop-blur-xl lg:p-6">
                <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-[17px] font-semibold text-brand-navy">Recent deliveries</h2>
                        <p className="mt-1 text-[12px] text-brand-body/55">Your newest finished work from CDS Space.</p>
                    </div>
                    <Link href={dashboardPath("/dashboard/documents")} className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-brand-blue hover:underline">
                        View documents <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
                {isLoading ? (
                    <div className="grid min-h-28 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-brand-blue/40" /></div>
                ) : recentDeliveries.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-brand-stroke/30 bg-[#F8FAFD] px-5 py-7 text-center text-[12px] text-brand-body/45">Your completed work will appear here as soon as it is delivered.</div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {recentDeliveries.map((delivery) => (
                            <a key={delivery.id} href={delivery.url} target="_blank" rel="noopener noreferrer" className="group rounded-xl border border-brand-stroke/20 bg-white p-4 transition hover:border-blue-200 hover:shadow-[0_8px_24px_rgba(10,79,232,0.08)]">
                                <div className="flex items-start gap-3">
                                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-brand-blue"><FileCheck className="h-5 w-5" /></div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[13px] font-semibold text-brand-navy" title={delivery.title}>{delivery.title}</p>
                                        <p className="mt-1 text-[10px] text-brand-body/50">{delivery.delivery_type === "brand_identity" ? "Brand identity" : "Design delivery"} · {delivery.file_count} {delivery.file_count === 1 ? "file" : "files"}</p>
                                        <p className="mt-2 text-[10px] text-brand-body/45">Delivered {new Date(delivery.published_at).toLocaleDateString()}</p>
                                    </div>
                                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-brand-mute transition group-hover:translate-x-0.5 group-hover:text-brand-blue" />
                                </div>
                            </a>
                        ))}
                    </div>
                )}
            </section>

            {/* Top Row: Word of Day + Book Session */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
                {/* Word of the Day - takes 2 cols */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="lg:col-span-2 relative bg-[#0050DB] rounded-2xl p-7 lg:p-8 text-white overflow-hidden"
                >
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-3">
                            <BookOpen className="w-4 h-4" />
                            <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">Branding Word of the Day</span>
                        </div>

                        {word ? (
                            <>
                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                    <h2 ref={wordHeadingRef} data-word-heading className="text-[36px] lg:text-[44px] font-bold leading-tight">{word.word}</h2>
                                    <button onClick={() => void speak(word.word)}
                                        data-word-pronunciation
                                        className="p-2 rounded-full bg-white/15 hover:bg-white/25 transition"
                                        title="Pronounce"
                                        aria-label="Pronounce the branding word of the day">
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
                                    <UniversalShareButton
                                        title={`Branding Word of the Day: ${word.word}`}
                                        text={`Branding Word of the Day: ${word.word}\n${word.pronunciation || ""}\n\n${word.meaning}\n\nFrom CDS Space`}
                                        url="/"
                                        className="min-h-0 rounded-full border-white/10 bg-white/15 px-4 py-2 text-[12px] text-white shadow-none hover:bg-white/25"
                                    />
                                </div>
                            </>
                        ) : (
                            <p className="py-8 text-[14px] text-white/70">Branding insight is ready.</p>
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
                <Widget title="Pending Jobs" icon={<Clock className="w-4 h-4 text-amber-500" />} viewAllHref={dashboardPath("/dashboard/orders")} delay={0.15}>
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
                <Widget title="Past Invoices" icon={<FileCheck className="w-4 h-4 text-emerald-500" />} viewAllHref={dashboardPath("/dashboard/invoices")} delay={0.2}>
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
                                        <p className="text-[10px] text-brand-body/50">{formatFinanceDate(inv.issue_date)}</p>
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
                <Widget title="Recent Messages" icon={<MessageSquare className="w-4 h-4 text-brand-blue" />} viewAllHref={dashboardPath("/dashboard/messages")} delay={0.25}>
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
