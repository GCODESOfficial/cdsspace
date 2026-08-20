"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
    Upload,
    Loader2,
    Link2,
    ExternalLink,
    Pencil,
    Trash2,
    FileText,
    Plus,
    Check,
    X,
    Mail,
} from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import {
    CURRENCIES,
    CURRENCY_ORDER,
    type CurrencyCode,
    type PricingListData,
    type PricingListKind,
} from "@/lib/pricing/types";
import { applyAutoConvertToList } from "@/lib/pricing/conversion";
import { appPrompt, appConfirm } from "@/lib/app-notify";

/** A blank draft - the manual alternative to uploading a PDF. */
function emptyPricingList(currencies: CurrencyCode[], kind: PricingListKind): PricingListData {
    const chosen = currencies.length ? currencies : ["ngn" as CurrencyCode];
    const currencyMeta: PricingListData["currencyMeta"] = {};
    for (const c of chosen) currencyMeta[c] = { market: CURRENCIES[c].market, note: "" };
    const base: PricingListData = {
        id: "",
        slug: "",
        title: "Untitled pricelist",
        subtitle: "",
        kind,
        currencies: chosen,
        currencyMeta,
        preparedBy: "",
        website: "",
        email: "",
        effectiveDate: "",
        tagline: "",
        contextNote: "",
        packages: [],
        matrix: kind === "matrix"
            ? { rowLabel: "Size", variants: [{ id: "standard", name: "Standard" }], rows: [], notes: [] }
            : undefined,
        recommendedPaths: [],
        addOns: [],
        deliveryProcess: [],
        terms: [],
        published: false,
    };
    // Auto-conversion on by default when NGN is chosen (adds USD & RWF).
    return chosen.includes("ngn") ? applyAutoConvertToList(base) : base;
}

const SITE_URL = "https://cdsspace.pro";

export default function PricelistsPage() {
    const router = useRouter();
    const [lists, setLists] = useState<PricingListData[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newCurrencies, setNewCurrencies] = useState<CurrencyCode[]>(["ngn"]);
    const [newKind, setNewKind] = useState<PricingListKind>("packages");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [titleDraft, setTitleDraft] = useState("");
    const [savingTitle, setSavingTitle] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Toggle a currency for the next new pricelist (at least one stays selected).
    const toggleNewCurrency = useCallback((c: CurrencyCode) => {
        setNewCurrencies((prev) => {
            const has = prev.includes(c);
            const next = has ? prev.filter((x) => x !== c) : [...prev, c];
            const ordered = CURRENCY_ORDER.filter((x) => next.includes(x));
            return ordered.length ? ordered : prev;
        });
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch("/api/admin/finance/pricelists");
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Failed to load");
            setLists(j.lists ?? []);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to load pricelists");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const onUpload = useCallback(
        async (file: File) => {
            setUploading(true);
            const t = toast.loading("Reading PDF and extracting pricing…");
            try {
                const fd = new FormData();
                fd.append("file", file);
                fd.append("kind", newKind);
                const parseRes = await fetch("/api/admin/finance/pricelists/parse", {
                    method: "POST",
                    body: fd,
                });
                const parsed = await parseRes.json();
                if (!parseRes.ok) throw new Error(parsed.error || "Extraction failed");

                // Persist as a draft, then open the review editor.
                const saveRes = await fetch("/api/admin/finance/pricelists", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...parsed.list, published: false }),
                });
                const saved = await saveRes.json();
                if (!saveRes.ok) throw new Error(saved.error || "Failed to save draft");

                toast.success(
                    `Extracted via ${parsed.method === "ai" ? "AI" : "parser"} - review before publishing`,
                    { id: t },
                );
                if (parsed.warnings?.length) parsed.warnings.forEach((w: string) => toast.warning(w));
                router.push(`/admin/finance/pricelists/${saved.list.id}`);
            } catch (e) {
                toast.error(e instanceof Error ? e.message : "Upload failed", { id: t });
            } finally {
                setUploading(false);
                if (fileRef.current) fileRef.current.value = "";
            }
        },
        [router, newKind],
    );

    const onCreate = useCallback(async () => {
        setCreating(true);
        const t = toast.loading("Creating pricelist…");
        try {
            const res = await fetch("/api/admin/finance/pricelists", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(emptyPricingList(newCurrencies, newKind)),
            });
            const saved = await res.json();
            if (!res.ok) throw new Error(saved.error || "Failed to create pricelist");
            toast.success("Draft created - add your packages", { id: t });
            router.push(`/admin/finance/pricelists/${saved.list.id}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to create pricelist", { id: t });
            setCreating(false);
        }
    }, [router, newCurrencies, newKind]);

    // Inline rename from the card (keeps slug stable so shared links don't break).
    const saveTitle = useCallback(async (id: string) => {
        const title = titleDraft.trim();
        if (!title) return;
        setSavingTitle(true);
        try {
            const r = await fetch(`/api/admin/finance/pricelists/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title }),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Rename failed");
            setLists((prev) => prev.map((l) => (l.id === id ? j.list : l)));
            setEditingId(null);
            toast.success("Title updated");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Rename failed");
        } finally {
            setSavingTitle(false);
        }
    }, [titleDraft]);

    const del = useCallback(
        async (id: string, title: string) => {
            if (!(await appConfirm(`Delete "${title}"? This cannot be undone.`))) return;
            try {
                const r = await fetch(`/api/admin/finance/pricelists/${id}`, { method: "DELETE" });
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}));
                    throw new Error(j.error || "Delete failed");
                }
                toast.success("Pricelist deleted");
                setLists((prev) => prev.filter((l) => l.id !== id));
            } catch (e) {
                toast.error(e instanceof Error ? e.message : "Delete failed");
            }
        },
        [],
    );

    const copyLink = useCallback((slug: string) => {
        navigator.clipboard.writeText(`${SITE_URL}/pricing/${slug}`);
        toast.success("Client link copied");
    }, []);

    const sendViaEmail = useCallback(async (id: string) => {
        const to = await appPrompt({
            title: "Email pricelist",
            message: "Send this pricelist to:",
            placeholder: "client@email.com",
            inputType: "email",
            confirmLabel: "Send",
        });
        if (!to || !to.trim()) return;
        const t = toast.loading("Sending pricelist…");
        try {
            const r = await fetch("/api/admin/finance/share", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind: "pricelist", id, to: to.trim() }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.ok) throw new Error(j.error || "Failed to send");
            toast.success(`Pricelist emailed to ${j.to}`, { id: t });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not send", { id: t });
        }
    }, []);

    return (
        <FinanceShell
            title="Pricelists"
            subtitle="Upload a pricing PDF and share a live, mobile-friendly pricelist with clients."
        >
            {/* Create a pricelist */}
            <div className={`${glassCard} mb-6 p-5 md:p-6`}>
                <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
                <p className="text-sm font-semibold text-gray-900">Create a pricelist</p>
                <div className="mt-4 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                        <div>
                            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Template</span>
                            <div className="inline-flex rounded-full border border-gray-200 bg-white p-1">
                                {([["packages", "Packages"], ["matrix", "Table"]] as const).map(([k, label]) => (
                                    <button key={k} type="button" onClick={() => setNewKind(k)} aria-pressed={newKind === k}
                                        className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${newKind === k ? "bg-brand-navy text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Currencies</span>
                            <div className="inline-flex rounded-full border border-gray-200 bg-white p-1">
                                {CURRENCY_ORDER.map((c) => {
                                    const active = newCurrencies.includes(c);
                                    return (
                                        <button key={c} type="button" onClick={() => toggleNewCurrency(c)} aria-pressed={active}
                                            className={`rounded-full px-2.5 py-1.5 text-xs font-semibold transition-all ${active ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>
                                            {CURRENCIES[c].flag} {CURRENCIES[c].symbol}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" disabled={creating || uploading} onClick={onCreate}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-blue-300 hover:text-blue-700 active:scale-95 disabled:opacity-60 xl:flex-none">
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Start blank
                        </button>
                        <button type="button" disabled={uploading || creating} onClick={() => fileRef.current?.click()}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#0A4FE8] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-[#083FC2] active:scale-95 disabled:opacity-60 xl:flex-none">
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {uploading ? "Extracting…" : "Upload PDF"}
                        </button>
                    </div>
                </div>
                <p className="mt-4 flex items-start gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                    <span><b>Packages</b> is a card layout; <b>Table</b> is a size × material matrix. Uploading a PDF auto-extracts packages, add-ons, delivery &amp; terms for review. Picking <b>NGN</b> auto-fills USD (5×) &amp; RWF - choose only USD or RWF for a single-currency list.</span>
                </p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-gray-400">
                    <Loader2 className="h-6 w-6 animate-spin" />
                </div>
            ) : lists.length === 0 ? (
                <div className={`${glassCard} flex flex-col items-center gap-3 py-16 text-center`}>
                    <FileText className="h-10 w-10 text-gray-300" />
                    <p className="text-sm font-medium text-gray-600">No pricelists yet.</p>
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                        >
                            Upload your first PDF →
                        </button>
                        <span className="text-gray-300">·</span>
                        <button
                            type="button"
                            disabled={creating}
                            onClick={onCreate}
                            className="text-sm font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-60"
                        >
                            Start from scratch
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {lists.map((list) => (
                        <div key={list.id} className={`${glassCard} flex flex-col p-5`}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {(list.currencies ?? []).map((c) => (
                                        <span key={c} className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold text-gray-700">
                                            {CURRENCIES[c].flag} {CURRENCIES[c].symbol}
                                        </span>
                                    ))}
                                </div>
                                <span
                                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                        list.published ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                                    }`}
                                >
                                    {list.published ? "Published" : "Draft"}
                                </span>
                            </div>
                            {editingId === list.id ? (
                                <div className="mt-3 flex items-center gap-1.5">
                                    <input
                                        autoFocus
                                        value={titleDraft}
                                        onChange={(e) => setTitleDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") saveTitle(list.id);
                                            if (e.key === "Escape") setEditingId(null);
                                        }}
                                        className="min-w-0 flex-1 rounded-lg border border-blue-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-100"
                                    />
                                    <button
                                        type="button"
                                        disabled={savingTitle}
                                        onClick={() => saveTitle(list.id)}
                                        className="rounded-lg bg-blue-600 p-1.5 text-white hover:bg-blue-700 disabled:opacity-60"
                                    >
                                        {savingTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditingId(null)}
                                        className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-gray-300"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-3 flex items-start gap-1.5">
                                    <h3 className="text-[16px] font-semibold leading-tight text-gray-900">{list.title}</h3>
                                    <button
                                        type="button"
                                        title="Rename"
                                        onClick={() => { setEditingId(list.id); setTitleDraft(list.title); }}
                                        className="mt-0.5 shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            )}
                            <p className="mt-1 text-xs text-gray-500">
                                {list.kind === "matrix"
                                    ? `Table · ${list.matrix?.rows?.length ?? 0} rows · ${list.matrix?.variants?.length ?? 0} options`
                                    : `${list.packages?.length ?? 0} packages · ${list.addOns?.length ?? 0} add-ons`}
                            </p>

                            <div className="mt-4 flex flex-wrap items-center gap-1.5 pt-3 border-t border-gray-100">
                                <Link
                                    href={`/admin/finance/pricelists/${list.id}`}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                                >
                                    <Pencil className="h-3.5 w-3.5" /> Edit
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => copyLink(list.slug)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-blue-300"
                                >
                                    <Link2 className="h-3.5 w-3.5" /> Copy link
                                </button>
                                <button
                                    type="button"
                                    onClick={() => sendViaEmail(list.id)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-blue-300"
                                >
                                    <Mail className="h-3.5 w-3.5" /> Email
                                </button>
                                {list.published && (
                                    <a
                                        href={`/pricing/${list.slug}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-blue-300"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" /> Open
                                    </a>
                                )}
                                <button
                                    type="button"
                                    onClick={() => del(list.id, list.title)}
                                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:border-red-300"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </FinanceShell>
    );
}
