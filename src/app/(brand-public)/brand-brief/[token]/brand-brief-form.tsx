"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Check, Download, Loader2, Send, AlertCircle } from "lucide-react";
import {
    ASSET_OPTIONS,
    budgetRangesForCurrency,
    TIMELINE_OPTIONS,
    briefToDraft,
    EMPTY_BRAND_BRIEF_DRAFT,
    type BrandBrief,
    type BrandBriefDraft,
} from "@/lib/brand-brief";
import { CLIENT_BILLING_CURRENCY_OPTIONS } from "@/lib/client-billing";

interface Props {
    token: string;
    initial: BrandBrief;
}

/** Small helper for the save state indicator. */
type SaveState = "idle" | "saving" | "saved" | "error";

export function BrandBriefForm({ token, initial }: Props) {
    const [draft, setDraft] = useState<BrandBriefDraft>(() =>
        initial.status === "submitted" ? briefToDraft(initial) : { ...EMPTY_BRAND_BRIEF_DRAFT, ...briefToDraft(initial) },
    );
    const [status, setStatus] = useState<BrandBrief["status"]>(initial.status);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [submittedAt, setSubmittedAt] = useState<string | null>(initial.submitted_at);
    const lastSavedRef = useRef<string>(JSON.stringify(briefToDraft(initial)));
    const submittedRef = useRef(initial.status === "submitted");
    submittedRef.current = status === "submitted";

    const readOnly = status === "submitted";

    /** Auto-save on change (debounced). Skip once we're submitted. */
    useEffect(() => {
        if (submittedRef.current) return;
        const serialized = JSON.stringify(draft);
        if (serialized === lastSavedRef.current) return;

        const t = setTimeout(async () => {
            if (submittedRef.current) return;
            if (serialized === lastSavedRef.current) return;
            setSaveState("saving");
            try {
                const r = await fetch(`/api/brand-brief/${token}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: serialized,
                });
                if (r.ok) {
                    lastSavedRef.current = serialized;
                    setSaveState("saved");
                    setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2000);
                } else {
                    setSaveState("error");
                }
            } catch {
                setSaveState("error");
            }
        }, 1200);

        return () => clearTimeout(t);
    }, [draft, token]);

    const update = <K extends keyof BrandBriefDraft>(key: K, value: BrandBriefDraft[K]) => {
        if (readOnly) return;
        setDraft((d) => ({ ...d, [key]: value }));
    };

    const toggleAsset = (opt: string) => {
        if (readOnly) return;
        setDraft((d) => ({
            ...d,
            assets_needed: d.assets_needed.includes(opt)
                ? d.assets_needed.filter((x) => x !== opt)
                : [...d.assets_needed, opt],
        }));
    };

    const handleSubmit = async () => {
        setError(null);

        if (!draft.brand_name.trim()) { setError("Please enter your brand name."); return; }
        if (!draft.contact_email.trim()) { setError("Please enter an email so we can reach you."); return; }

        setSubmitting(true);
        try {
            const r = await fetch(`/api/brand-brief/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(draft),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) {
                setError(d.error || "Couldn't submit. Please try again.");
                return;
            }
            setStatus("submitted");
            setSubmittedAt(d?.brief?.submitted_at ?? new Date().toISOString());
            lastSavedRef.current = JSON.stringify(draft);
            if (typeof window !== "undefined") {
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Network error");
        } finally {
            setSubmitting(false);
        }
    };

    const download = async () => {
        const { exportBrandBriefToPdf } = await import("@/lib/brand-brief-pdf");
        exportBrandBriefToPdf(draft, {
            inviteLabel: initial.invite_label,
            status,
            submittedAt,
        });
    };

    const progress = useMemo(() => {
        const keys = Object.keys(EMPTY_BRAND_BRIEF_DRAFT) as (keyof BrandBriefDraft)[];
        const filled = keys.filter((k) => {
            const v = draft[k];
            if (Array.isArray(v)) return v.length > 0;
            return Boolean(v?.toString().trim());
        }).length;
        return Math.round((filled / keys.length) * 100);
    }, [draft]);

    return (
        <main className="min-h-screen bg-brand-bg">
            {/* Starlight hero */}
            <section
                className="relative overflow-hidden text-white px-5 md:px-10 pt-10 pb-16 md:pt-14 md:pb-20"
                style={{
                    background: "radial-gradient(60% 80% at 50% 10%, #0a4fe880 0%, transparent 70%), linear-gradient(180deg, #040b37 0%, #081149 100%)",
                }}
            >
                <div className="max-w-3xl mx-auto relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                            <Image
                                src="/navbar/CDS Logo.svg"
                                alt="CDS Space"
                                width={28}
                                height={28}
                                className="brightness-0 invert"
                            />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-semibold">
                                CDS Space
                            </p>
                            <p className="text-[13px] text-white/80 font-medium">Brand Brief</p>
                        </div>
                    </div>

                    <h1 className="text-[28px] sm:text-[34px] md:text-[44px] font-bold leading-[1.1] tracking-[-0.02em] max-w-2xl">
                        Tell us about your brand.
                    </h1>
                    <p className="text-white/75 mt-3 text-[14px] sm:text-[15px] leading-relaxed max-w-xl">
                        No account needed - fill in what you know, skip what you don&apos;t, and we&apos;ll take it from
                        there. You can download a copy as a PDF at any time.
                    </p>

                    {initial.invite_label && (
                        <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[12px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Brief requested: {initial.invite_label}
                        </div>
                    )}
                </div>
            </section>

            {/* Submitted success banner */}
            {status === "submitted" && (
                <div className="max-w-3xl mx-auto px-5 md:px-0 -mt-10 relative z-20">
                    <div className="bg-white rounded-3xl shadow-xl border border-emerald-100 p-5 md:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                            <Check className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-semibold text-[#0D1B39]">
                                Thank you - your brief is with us.
                            </p>
                            <p className="text-[13px] text-gray-500 mt-0.5">
                                We&apos;ll reach out to {draft.contact_email || "you"} within 1 business day. You can
                                download a copy below.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={download}
                            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0A4FE8] text-white text-sm font-semibold hover:bg-[#0743c5] transition"
                        >
                            <Download className="w-4 h-4" /> Download PDF
                        </button>
                    </div>
                </div>
            )}

            {/* Form card */}
            <section className="max-w-3xl mx-auto px-5 md:px-6 py-8 md:py-12">
                {/* Progress + save state - sticky on mobile */}
                <div className="sticky top-0 z-30 -mx-5 md:mx-0 mb-6 md:mb-8 bg-brand-bg/90 backdrop-blur px-5 md:px-0 py-3 md:py-0 md:bg-transparent md:backdrop-blur-none">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1.5">
                                <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
                                    {status === "submitted" ? "Submitted" : `${progress}% complete`}
                                </p>
                                <SaveIndicator state={saveState} readOnly={readOnly} />
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                        width: `${progress}%`,
                                        background: "linear-gradient(90deg, #0035C1 0%, #0575FF 100%)",
                                    }}
                                />
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={download}
                            className="shrink-0 hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-[#0D1B39] text-[13px] font-semibold hover:bg-gray-50 transition"
                        >
                            <Download className="w-4 h-4" /> Download
                        </button>
                    </div>
                </div>

                <div className="space-y-5 md:space-y-6">
                    <Section title="The Brand" step="01">
                        <Field label="Brand name" required>
                            <input
                                value={draft.brand_name}
                                onChange={(e) => update("brand_name", e.target.value)}
                                disabled={readOnly}
                                placeholder="e.g. Adeesi"
                                className="input"
                            />
                        </Field>
                        <Field label="Tagline / one-liner">
                            <input
                                value={draft.brand_tagline}
                                onChange={(e) => update("brand_tagline", e.target.value)}
                                disabled={readOnly}
                                placeholder="The one sentence you'd use to describe it"
                                className="input"
                            />
                        </Field>
                        <Field label="Industry">
                            <input
                                value={draft.industry}
                                onChange={(e) => update("industry", e.target.value)}
                                disabled={readOnly}
                                placeholder="e.g. Food & beverage, fintech, fashion"
                                className="input"
                            />
                        </Field>
                        <Field label="What does your brand do?" span2>
                            <textarea
                                value={draft.brand_description}
                                onChange={(e) => update("brand_description", e.target.value)}
                                disabled={readOnly}
                                placeholder="What you sell or serve, who it's for, how it works."
                                className="input min-h-[110px]"
                            />
                        </Field>
                    </Section>

                    <Section title="Who we can reach" step="02">
                        <Field label="Your name">
                            <input
                                value={draft.contact_name}
                                onChange={(e) => update("contact_name", e.target.value)}
                                disabled={readOnly}
                                placeholder="Full name"
                                className="input"
                            />
                        </Field>
                        <Field label="Email" required>
                            <input
                                type="email"
                                value={draft.contact_email}
                                onChange={(e) => update("contact_email", e.target.value)}
                                disabled={readOnly}
                                placeholder="you@brand.com"
                                className="input"
                            />
                        </Field>
                        <Field label="Phone or WhatsApp">
                            <input
                                value={draft.contact_phone}
                                onChange={(e) => update("contact_phone", e.target.value)}
                                disabled={readOnly}
                                placeholder="+234…"
                                className="input"
                            />
                        </Field>
                    </Section>

                    <Section title="Audience & Market" step="03">
                        <Field label="Who are you trying to reach?" span2>
                            <textarea
                                value={draft.target_audience}
                                onChange={(e) => update("target_audience", e.target.value)}
                                disabled={readOnly}
                                placeholder="Describe your ideal customer - age, lifestyle, habits, where they live."
                                className="input min-h-[100px]"
                            />
                        </Field>
                        <Field label="Competitors / brands you admire" span2>
                            <textarea
                                value={draft.competitors}
                                onChange={(e) => update("competitors", e.target.value)}
                                disabled={readOnly}
                                placeholder="List names or paste links. It's fine to mix direct competitors with brands you just love."
                                className="input min-h-[90px]"
                            />
                        </Field>
                        <Field label="What makes you different?" span2>
                            <textarea
                                value={draft.unique_selling_point}
                                onChange={(e) => update("unique_selling_point", e.target.value)}
                                disabled={readOnly}
                                placeholder="What do you do better, differently, or only you can claim?"
                                className="input min-h-[90px]"
                            />
                        </Field>
                    </Section>

                    <Section title="Brand Identity" step="04">
                        <Field label="Brand personality" span2>
                            <input
                                value={draft.brand_personality}
                                onChange={(e) => update("brand_personality", e.target.value)}
                                disabled={readOnly}
                                placeholder="3–5 words. Bold. Premium. Playful. Trustworthy. Local. Modern."
                                className="input"
                            />
                        </Field>
                        <Field label="Core values" span2>
                            <textarea
                                value={draft.brand_values}
                                onChange={(e) => update("brand_values", e.target.value)}
                                disabled={readOnly}
                                placeholder="What your brand stands for - culturally, ethically, creatively."
                                className="input min-h-[90px]"
                            />
                        </Field>
                        <Field label="Design preferences" span2>
                            <textarea
                                value={draft.design_preferences}
                                onChange={(e) => update("design_preferences", e.target.value)}
                                disabled={readOnly}
                                placeholder="Colors, typography, moods, things you love, things to avoid."
                                className="input min-h-[90px]"
                            />
                        </Field>
                        <Field label="Inspiration & references" span2>
                            <textarea
                                value={draft.inspiration_references}
                                onChange={(e) => update("inspiration_references", e.target.value)}
                                disabled={readOnly}
                                placeholder="Paste Pinterest / Behance / Instagram links, or describe visuals that resonate."
                                className="input min-h-[90px]"
                            />
                        </Field>
                    </Section>

                    <Section title="Scope & Goals" step="05">
                        <Field label="What do you need from CDS Space?" span2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {ASSET_OPTIONS.map((opt) => {
                                    const active = draft.assets_needed.includes(opt);
                                    return (
                                        <button
                                            key={opt}
                                            type="button"
                                            disabled={readOnly}
                                            onClick={() => toggleAsset(opt)}
                                            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-[13.5px] font-medium transition text-left ${
                                                active
                                                    ? "bg-[#0A4FE8] text-white border-transparent shadow-sm shadow-blue-200"
                                                    : "bg-white text-[#0D1B39] border-gray-200 hover:border-blue-300"
                                            } disabled:opacity-60 disabled:cursor-not-allowed`}
                                        >
                                            <span
                                                className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                                                    active ? "bg-white/20 border-white/40" : "bg-gray-50 border-gray-300"
                                                }`}
                                            >
                                                {active && <Check className="w-3 h-3 text-white" />}
                                            </span>
                                            {opt}
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>
                        <Field label="Short-term goals">
                            <textarea
                                value={draft.goals}
                                onChange={(e) => update("goals", e.target.value)}
                                disabled={readOnly}
                                placeholder="What does success look like in the next 3–6 months?"
                                className="input min-h-[90px]"
                            />
                        </Field>
                        <Field label="Long-term vision">
                            <textarea
                                value={draft.long_term_vision}
                                onChange={(e) => update("long_term_vision", e.target.value)}
                                disabled={readOnly}
                                placeholder="Where do you see the brand in 2–5 years?"
                                className="input min-h-[90px]"
                            />
                        </Field>
                        <Field label="Budget currency">
                            <select
                                value={draft.budget_currency}
                                onChange={(e) => {
                                    // Ranges are currency specific, so a change of
                                    // currency invalidates whatever range was picked.
                                    update("budget_currency", e.target.value);
                                    update("budget_range", "");
                                }}
                                disabled={readOnly}
                                className="input"
                            >
                                <option value="">Select a currency</option>
                                {CLIENT_BILLING_CURRENCY_OPTIONS.map((option) => (
                                    <option key={option.code} value={option.code}>
                                        {option.symbol} {option.name} ({option.code})
                                    </option>
                                ))}
                            </select>
                        </Field>
                        {draft.budget_currency ? (
                            <Field label={`Budget range (${draft.budget_currency})`}>
                                <select
                                    value={draft.budget_range}
                                    onChange={(e) => update("budget_range", e.target.value)}
                                    disabled={readOnly}
                                    className="input"
                                >
                                    <option value="">Select a range</option>
                                    {budgetRangesForCurrency(draft.budget_currency).map((b) => (
                                        <option key={b} value={b}>
                                            {b}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        ) : (
                            <Field label="Budget range">
                                <p className="text-[13px] leading-6 text-brand-body/60">
                                    Choose a budget currency above and the matching ranges will appear here.
                                </p>
                            </Field>
                        )}
                        <Field label="Timeline">
                            <select
                                value={draft.timeline}
                                onChange={(e) => update("timeline", e.target.value)}
                                disabled={readOnly}
                                className="input"
                            >
                                <option value="">Select</option>
                                {TIMELINE_OPTIONS.map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Anything else we should know?" span2>
                            <textarea
                                value={draft.additional_notes}
                                onChange={(e) => update("additional_notes", e.target.value)}
                                disabled={readOnly}
                                placeholder="Anything important that didn't fit above."
                                className="input min-h-[100px]"
                            />
                        </Field>
                    </Section>

                    {/* Error */}
                    {error && (
                        <div className="flex items-start gap-2 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Footer actions */}
                    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                        <button
                            type="button"
                            onClick={download}
                            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-gray-200 bg-white text-[#0D1B39] text-sm font-semibold hover:bg-gray-50 transition"
                        >
                            <Download className="w-4 h-4" /> Download a copy
                        </button>
                        {status !== "submitted" && (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-semibold shadow-lg shadow-blue-600/30 disabled:opacity-60"
                                style={{
                                    background: "linear-gradient(146.28deg, #0035C1 8.83%, #0575FF 86.3%)",
                                }}
                            >
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                {submitting ? "Submitting…" : "Submit brief"}
                            </button>
                        )}
                    </div>

                    <p className="text-[12px] text-gray-400 text-center pt-1">
                        We auto-save as you type. Nothing is shared until you hit submit.
                    </p>
                </div>
            </section>

            {/* Tailwind-style utility class via inline style tag - Satori-compatible scope */}
            <style>{`
                .input {
                    width: 100%;
                    height: 46px;
                    padding: 0 14px;
                    border-radius: 14px;
                    border: 1px solid #e5e7eb;
                    background: #ffffff;
                    color: #0D1B39;
                    font-size: 14.5px;
                    outline: none;
                    transition: border-color 0.15s, box-shadow 0.15s;
                }
                textarea.input {
                    height: auto;
                    padding: 12px 14px;
                    line-height: 1.55;
                    resize: vertical;
                }
                .input:focus {
                    border-color: #0A4FE8;
                    box-shadow: 0 0 0 4px rgba(10, 79, 232, 0.12);
                }
                .input::placeholder { color: #94a3b8; }
                .input:disabled {
                    background: #f8fafc;
                    color: #64748b;
                    cursor: not-allowed;
                }
            `}</style>
        </main>
    );
}

function Section({
    title,
    step,
    children,
}: {
    title: string;
    step: string;
    children: React.ReactNode;
}) {
    return (
        <section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-7">
            <div className="flex items-center gap-3 mb-5">
                <span className="text-[11px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                    {step}
                </span>
                <h2 className="text-[18px] md:text-[20px] font-bold text-[#0D1B39]">{title}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">{children}</div>
        </section>
    );
}

function Field({
    label,
    children,
    required,
    span2,
}: {
    label: string;
    children: React.ReactNode;
    required?: boolean;
    span2?: boolean;
}) {
    return (
        <div className={span2 ? "md:col-span-2" : ""}>
            <label className="block text-[12px] font-semibold text-[#0D1B39] mb-1.5">
                {label}
                {required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {children}
        </div>
    );
}

function SaveIndicator({ state, readOnly }: { state: SaveState; readOnly: boolean }) {
    if (readOnly) {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                <Check className="w-3 h-3" /> Submitted - read-only
            </span>
        );
    }
    if (state === "saving") {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 font-medium">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </span>
        );
    }
    if (state === "saved") {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                <Check className="w-3 h-3" /> Saved
            </span>
        );
    }
    if (state === "error") {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] text-red-500 font-medium">
                <AlertCircle className="w-3 h-3" /> Couldn&apos;t save
            </span>
        );
    }
    return <span className="text-[11px] text-gray-400">Auto-saves as you type</span>;
}
