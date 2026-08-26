"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { UploadCloud, X, FileText, Image as ImageIcon, CheckCircle2, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { COUNTRIES, DIAL_COUNTRIES } from "@/lib/countries";

interface FileWithPreview extends File {
    preview?: string;
}

const TOPICS = ["Brand identity", "Website / App", "Content & Social", "Print & Merch", "Strategy & Consulting", "Something else"];
const HOW_HEARD = ["X / Twitter", "Instagram", "Referral", "Google search", "LinkedIn", "Friend", "Other"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MORNING = "Morning (8am - 12pm)";
const TIME_WINDOWS = [MORNING, "Afternoon (12 - 4pm)", "Evening (4 - 8pm)"];
// We do not run morning sessions on Sundays.
const SUNDAY_TIME_WINDOWS = TIME_WINDOWS.filter((t) => t !== MORNING);
const timeWindowsFor = (day: string) => (day === "Sun" ? SUNDAY_TIME_WINDOWS : TIME_WINDOWS);

export const ConsultationForm = () => {
    const [uploadedFiles, setUploadedFiles] = useState<FileWithPreview[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [form, setForm] = useState({
        full_name: "", email: "", company: "", whatsapp: "", location: "",
        message: "", how_heard: "",
    });
    // Dial code is picked separately so the number itself stays clean.
    const [whatsappCountry, setWhatsappCountry] = useState("");
    const [topics, setTopics] = useState<string[]>([]);
    // One day at a time: a single window is easier for us to actually honour.
    const [prefDay, setPrefDay] = useState("");
    const [prefTimes, setPrefTimes] = useState<string[]>([]);
    const [howHeardCustom, setHowHeardCustom] = useState(false);

    // Set when the visitor arrived from the Kickoff Meet button on a proposal
    // link, so the booking can be tied back to that proposal.
    const [proposalToken, setProposalToken] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const dial = DIAL_COUNTRIES.find((c) => c.code === whatsappCountry)?.dial || "";
    const messengerNumber = () => {
        const digits = form.whatsapp.trim();
        if (!digits) return "";
        if (digits.startsWith("+")) return digits;
        return dial ? `+${dial} ${digits}` : digits;
    };

    const toggle = (arr: string[], set: (v: string[]) => void, value: string) =>
        set(arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value]);

    // Everything is required except the messenger number and the uploads.
    const missing = () => {
        if (!form.full_name.trim()) return "Please enter your full name.";
        if (!form.email.trim()) return "Please enter your email address.";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) return "Please enter a valid email address.";
        if (!form.company.trim()) return "Please enter your company or brand name.";
        if (!form.location.trim()) return "Please select your business location.";
        if (topics.length === 0) return "Please choose at least one thing to discuss.";
        if (!form.message.trim()) return "Please tell us briefly about your project.";
        if (!prefDay) return "Please pick a preferred meeting day.";
        if (prefTimes.length === 0) return "Please pick at least one preferred time.";
        if (!form.how_heard.trim()) return "Please tell us how you heard about us.";
        return "";
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg("");
        const problem = missing();
        if (problem) {
            setErrorMsg(problem);
            return;
        }
        setSubmitting(true);
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => fd.append(k, k === "whatsapp" ? messengerNumber() : v));
        fd.append("topics", JSON.stringify(topics));
        fd.append("preferred_days", JSON.stringify(prefDay ? [prefDay] : []));
        fd.append("preferred_times", JSON.stringify(prefTimes));
        if (proposalToken) fd.append("proposal_token", proposalToken);
        uploadedFiles.forEach((f) => fd.append("files", f));
        try {
            const res = await fetch("/api/consultation", { method: "POST", body: fd });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || "Submission failed");
            }
            setSubmitted(true);
            setForm({ full_name: "", email: "", company: "", whatsapp: "", location: "", message: "", how_heard: "" });
            setTopics([]); setPrefDay(""); setPrefTimes([]); setHowHeardCustom(false);
            setUploadedFiles([]);
        } catch (err) {
            setErrorMsg((err as Error).message);
        } finally {
            setSubmitting(false);
        }
    };

    const processFiles = (files: File[]) => {
        const validFiles = files.filter((file) => {
            const isValidType = ["image/png", "image/jpeg", "image/svg+xml", "application/pdf"].includes(file.type);
            const isValidSize = file.size <= 10 * 1024 * 1024;
            return isValidType && isValidSize;
        }).map((file) => {
            const fileWithPreview = file as FileWithPreview;
            if (file.type.startsWith("image/")) fileWithPreview.preview = URL.createObjectURL(file);
            return fileWithPreview;
        });
        setUploadedFiles((prev) => [...prev, ...validFiles].slice(0, 5));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) processFiles(Array.from(e.target.files));
    };
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        if (e.dataTransfer.files) processFiles(Array.from(e.dataTransfer.files));
    };
    const removeFile = (index: number) => {
        setUploadedFiles((prev) => {
            const next = [...prev];
            if (next[index].preview) URL.revokeObjectURL(next[index].preview!);
            return next.filter((_, i) => i !== index);
        });
    };
    useEffect(() => () => { uploadedFiles.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // A visitor sent here by the Kickoff Meet button on a proposal carries the
    // proposal token in the URL. Read it once on mount; the server validates it.
    useEffect(() => {
        const token = new URLSearchParams(window.location.search).get("proposal") || "";
        if (/^[0-9a-f-]{36}$/i.test(token)) setProposalToken(token);
    }, []);

    // Auto country recognition: prefill the WhatsApp dial code + business
    // location from the visitor's country (our own /api/geo, no third-party API).
    useEffect(() => {
        let active = true;
        fetch("/api/geo")
            .then((r) => (r.ok ? r.json() : null))
            .then((geo) => {
                if (!active || !geo) return;
                if (geo.country) setWhatsappCountry((prev) => prev || String(geo.country));
                setForm((prev) => ({
                    ...prev,
                    location: prev.location || geo.name || "",
                }));
            })
            .catch(() => {});
        return () => { active = false; };
    }, []);

    const inputClass = "w-full bg-[#F4F6FB] border border-transparent focus:border-brand-blue/30 rounded-2xl px-4 sm:px-6 py-3.5 sm:py-4 outline-none transition-all placeholder:text-brand-body/40 text-brand-navy font-medium";
    const labelClass = "text-brand-navy text-base font-bold tracking-tight uppercase";

    return (
        <section className="w-full bg-brand-bg relative pb-20 sm:pb-24 md:pb-32">
            <div className="max-w-[1232px] mx-auto sm:border-l sm:border-r border-dashed border-brand-stroke-ii px-4 sm:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="max-w-[900px] mx-auto bg-white rounded-[28px] sm:rounded-[40px] border border-brand-stroke-ii p-5 sm:p-8 md:p-12 shadow-sm"
                >
                    {submitted && (
                        <div className="mb-6 flex items-start gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
                            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold text-emerald-900">Thanks - we&apos;ve received your request!</p>
                                <p className="text-sm text-emerald-800 mt-0.5">Our team will reach out within 24 hours to schedule your session.</p>
                            </div>
                        </div>
                    )}
                    {errorMsg && <div className="mb-6 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">{errorMsg}</div>}

                    <form className="space-y-6 sm:space-y-8" onSubmit={submit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                            <div className="space-y-3">
                                <label className={labelClass}>Full name</label>
                                <input type="text" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Enter your full name" className={inputClass} />
                            </div>
                            <div className="space-y-3">
                                <label className={labelClass}>Email address</label>
                                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Enter your email" className={inputClass} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                            <div className="space-y-3">
                                <label className={labelClass}>WhatsApp / WeChat <span className="text-brand-body/40 font-medium normal-case">(optional)</span></label>
                                <div className="flex gap-2">
                                    <DialCodeSelect value={whatsappCountry} onChange={setWhatsappCountry} />
                                    <input type="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="800 000 0000" className={cn(inputClass, "flex-1 min-w-0")} />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className={labelClass}>Company / Brand</label>
                                <input type="text" required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Your company or brand name" className={inputClass} />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className={labelClass}>Business location</label>
                            <CountryCombobox value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
                        </div>

                        {/* What do you want to discuss - topic chips + details */}
                        <div className="space-y-3">
                            <label className={labelClass}>What do you want to discuss?</label>
                            <div className="flex flex-wrap gap-2.5">
                                {TOPICS.map((t) => (
                                    <Chip key={t} active={topics.includes(t)} onClick={() => toggle(topics, setTopics, t)}>{t}</Chip>
                                ))}
                            </div>
                            <textarea rows={4} required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Tell us briefly about your project or idea" className={cn(inputClass, "resize-none")} />
                        </div>

                        {/* Preferred meeting windows */}
                        <div className="space-y-3">
                            <label className={labelClass}>Preferred meeting window</label>
                            <p className="text-sm text-brand-body/50 -mt-1">Pick one day, then the times that work best for you.</p>
                            <div className="flex flex-wrap gap-2.5">
                                {DAYS.map((d) => (
                                    <Chip
                                        key={d}
                                        active={prefDay === d}
                                        onClick={() => {
                                            const next = prefDay === d ? "" : d;
                                            setPrefDay(next);
                                            // Drop any time that the new day does not offer.
                                            setPrefTimes((times) => times.filter((t) => timeWindowsFor(next).includes(t)));
                                        }}
                                    >{d}</Chip>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-2.5 pt-1">
                                {timeWindowsFor(prefDay).map((t) => (
                                    <Chip key={t} active={prefTimes.includes(t)} onClick={() => toggle(prefTimes, setPrefTimes, t)}>{t}</Chip>
                                ))}
                            </div>
                            {prefDay === "Sun" && (
                                <p className="text-sm text-brand-body/50">Sunday sessions run in the afternoon and evening only.</p>
                            )}
                        </div>

                        {/* Upload */}
                        <div className="space-y-3">
                            <label className={labelClass}>Upload brief or assets (Optional)</label>
                            <div
                                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={cn(
                                    "w-full min-h-[160px] bg-brand-bg border-2 border-dashed rounded-[24px] flex flex-col items-center justify-center p-6 sm:p-8 transition-all cursor-pointer group relative overflow-hidden",
                                    isDragging ? "border-brand-blue bg-brand-blue/5 scale-[1.01]" : "border-brand-stroke-ii hover:bg-white hover:border-brand-blue/30"
                                )}
                            >
                                <input type="file" className="hidden" multiple ref={fileInputRef} onChange={handleFileChange} accept=".png,.jpg,.jpeg,.svg,.pdf" />
                                {uploadedFiles.length === 0 ? (
                                    <>
                                        <div className="w-16 h-16 rounded-full bg-brand-blue/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-500">
                                            <UploadCloud className="text-brand-blue opacity-40 group-hover:opacity-100 transition-opacity" size={32} />
                                        </div>
                                        <p className="text-brand-navy font-bold text-base sm:text-lg text-center">
                                            <span className="text-brand-blue">Click to upload</span> or drag and drop
                                        </p>
                                        <p className="text-brand-body/40 text-sm mt-1 text-center">PDF, PNG, JPG or SVG (max. 10MB per file)</p>
                                    </>
                                ) : (
                                    <div className="w-full space-y-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-stroke-ii pb-4">
                                            <p className="text-brand-navy font-bold text-base">{uploadedFiles.length} file(s) selected</p>
                                            <button type="button" className="text-brand-blue text-sm font-bold hover:underline">Add more</button>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <AnimatePresence mode="popLayout">
                                                {uploadedFiles.map((file, idx) => (
                                                    <motion.div key={file.name + idx} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                                                        className="bg-white border border-brand-stroke-ii rounded-xl p-3 flex items-center justify-between group/file hover:shadow-md transition-shadow">
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <div className="w-10 h-10 rounded-lg bg-brand-bg flex items-center justify-center shrink-0 relative overflow-hidden">
                                                                {file.preview ? (
                                                                    <Image src={file.preview} alt="Preview" fill className="object-cover" />
                                                                ) : (
                                                                    file.type.includes("pdf") ? <FileText size={18} className="text-brand-blue opacity-40" /> : <ImageIcon size={18} className="text-brand-blue opacity-40" />
                                                                )}
                                                            </div>
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="text-sm font-bold text-brand-navy truncate">{file.name}</span>
                                                                <span className="text-[10px] text-brand-body/40 font-medium">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                                                            </div>
                                                        </div>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(idx); }} className="p-1.5 hover:bg-red-50 text-brand-body/30 hover:text-red-500 rounded-md transition-colors cursor-pointer">
                                                            <X size={16} />
                                                        </button>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* How did you hear - chips + custom */}
                        <div className="space-y-3 pb-4">
                            <label className={labelClass}>How did you hear about us?</label>
                            <div className="flex flex-wrap gap-2.5">
                                {HOW_HEARD.map((h) => (
                                    <Chip key={h} active={h === "Other" ? howHeardCustom : (!howHeardCustom && form.how_heard === h)}
                                        onClick={() => {
                                            if (h === "Other") { setHowHeardCustom(true); setForm({ ...form, how_heard: "" }); }
                                            else { setHowHeardCustom(false); setForm({ ...form, how_heard: h }); }
                                        }}>{h}</Chip>
                                ))}
                            </div>
                            {howHeardCustom && (
                                <input type="text" autoFocus value={form.how_heard} onChange={(e) => setForm({ ...form, how_heard: e.target.value })} placeholder="Tell us how you found us" className={inputClass} />
                            )}
                        </div>

                        <button type="submit" disabled={submitting} className="w-full text-white font-bold py-4 sm:py-5 rounded-full text-base sm:text-lg shadow-lg hover:shadow-xl active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed" style={{ background: "var(--color-brand-gradient)" }}>
                            {submitting ? "Sending…" : "Schedule a call"}
                        </button>
                    </form>
                </motion.div>
            </div>
        </section>
    );
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick}
            className={cn(
                "px-4 py-2.5 rounded-full text-sm font-semibold border transition-all active:scale-95",
                active ? "bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/20" : "bg-[#F4F6FB] text-brand-navy border-transparent hover:border-brand-blue/30"
            )}>
            {children}
        </button>
    );
}

/** Compact dial-code picker that sits beside the messenger number. */
function DialCodeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
    }, [open]);

    const selected = DIAL_COUNTRIES.find((c) => c.code === value);
    const needle = q.trim().toLowerCase().replace(/^\+/, "");
    const filtered = needle
        ? DIAL_COUNTRIES.filter((c) => c.name.toLowerCase().includes(needle) || c.dial.startsWith(needle) || c.code.toLowerCase() === needle).slice(0, 80)
        : DIAL_COUNTRIES;

    return (
        <div className="relative shrink-0" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-label="Select country code"
                className="h-full flex items-center gap-1.5 bg-[#F4F6FB] border border-transparent rounded-2xl px-3 sm:px-4 py-3.5 sm:py-4 outline-none transition-all hover:border-brand-blue/30"
            >
                <span className={selected ? "text-brand-navy font-medium" : "text-brand-body/40 font-medium"}>
                    {selected ? `${selected.code} +${selected.dial}` : "Code"}
                </span>
                <ChevronDown className={cn("w-4 h-4 text-brand-body/40 transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <div className="absolute z-30 mt-2 w-[280px] rounded-2xl border border-brand-stroke-ii bg-white shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-brand-stroke-ii flex items-center gap-2 px-3">
                        <Search className="w-4 h-4 text-brand-body/40" />
                        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Country or code…" className="w-full py-2 bg-transparent outline-none text-sm text-brand-navy" />
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                        {filtered.map((c) => (
                            <button key={c.code} type="button" onClick={() => { onChange(c.code); setOpen(false); setQ(""); }}
                                className={cn("w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-brand-bg transition-colors", value === c.code ? "text-brand-blue font-semibold" : "text-brand-navy")}>
                                <span className="truncate text-left">{c.name}</span>
                                <span className="shrink-0 text-brand-body/50">+{c.dial}</span>
                            </button>
                        ))}
                        {filtered.length === 0 && <p className="px-5 py-3 text-sm text-brand-body/40">No match for &ldquo;{q}&rdquo;.</p>}
                    </div>
                </div>
            )}
        </div>
    );
}

function CountryCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
    }, [open]);

    const filtered = q ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 80) : COUNTRIES;

    return (
        <div className="relative" ref={ref}>
            <button type="button" onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center justify-between bg-[#F4F6FB] border border-transparent rounded-2xl px-4 sm:px-6 py-3.5 sm:py-4 outline-none transition-all hover:border-brand-blue/30">
                <span className={value ? "text-brand-navy font-medium" : "text-brand-body/40 font-medium"}>{value || "Select your country"}</span>
                <ChevronDown className={cn("w-5 h-5 text-brand-body/40 transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <div className="absolute z-30 mt-2 w-full rounded-2xl border border-brand-stroke-ii bg-white shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-brand-stroke-ii flex items-center gap-2 px-3">
                        <Search className="w-4 h-4 text-brand-body/40" />
                        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search country…" className="w-full py-2 bg-transparent outline-none text-sm text-brand-navy" />
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                        {filtered.map((c) => (
                            <button key={c.code} type="button" onClick={() => { onChange(c.name); setOpen(false); setQ(""); }}
                                className={cn("w-full text-left px-5 py-2.5 text-sm hover:bg-brand-bg transition-colors", value === c.name ? "text-brand-blue font-semibold" : "text-brand-navy")}>
                                {c.name}
                            </button>
                        ))}
                        {filtered.length === 0 && <p className="px-5 py-3 text-sm text-brand-body/40">No country matches &ldquo;{q}&rdquo;.</p>}
                    </div>
                </div>
            )}
        </div>
    );
}
