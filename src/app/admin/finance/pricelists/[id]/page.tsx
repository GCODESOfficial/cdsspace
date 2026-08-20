"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    Loader2, Save, Upload, Plus, Trash2, Link2, ExternalLink, Globe, EyeOff, Calculator, RefreshCw, Lock,
} from "lucide-react";
import FinanceShell, { glassCard, solidCard } from "@/components/finance/FinanceShell";
import {
    CURRENCIES, CURRENCY_ORDER, listKind, slugify,
    type AddOn, type CurrencyCode, type MatrixData, type PricingListData, type PricingPackage,
} from "@/lib/pricing/types";
import {
    CONVERSION_RATES, CURRENCY_MULTIPLIERS, applyAutoConvertToList, convertFromNgn,
} from "@/lib/pricing/conversion";

const SITE_URL = "https://cdsspace.pro";

export default function PricelistEditorPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [list, setList] = useState<PricingListData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        (async () => {
            try {
                const r = await fetch(`/api/admin/finance/pricelists/${id}`);
                const j = await r.json();
                if (!r.ok) throw new Error(j.error || "Not found");
                setList(j.list);
            } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to load");
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    const patch = useCallback((p: Partial<PricingListData>) => {
        setList((prev) => (prev ? { ...prev, ...p } : prev));
    }, []);

    // Enable/disable NGN→USD(5×)/RWF(1×) auto-conversion for the whole list.
    const setAutoConvert = useCallback((on: boolean) => {
        setList((prev) => {
            if (!prev) return prev;
            if (on) {
                toast.success("USD & RWF now auto-fill from NGN. Save to persist.");
                return applyAutoConvertToList(prev);
            }
            return { ...prev, autoConvert: false };
        });
    }, []);

    // Recompute every USD/RWF amount from its NGN value using the current rates.
    const recalcAll = useCallback(() => {
        setList((prev) => (prev ? applyAutoConvertToList(prev) : prev));
        toast.success("Recalculated USD & RWF from NGN");
    }, []);

    // Add/remove a currency on the list (at least one must remain).
    const toggleCurrency = useCallback((c: CurrencyCode) => {
        setList((prev) => {
            if (!prev) return prev;
            const has = prev.currencies.includes(c);
            const next = CURRENCY_ORDER.filter((x) =>
                has ? prev.currencies.includes(x) && x !== c : prev.currencies.includes(x) || x === c,
            );
            if (!next.length) return prev;
            const currencyMeta = { ...prev.currencyMeta };
            if (has) delete currencyMeta[c];
            else currencyMeta[c] = { market: CURRENCIES[c].market, note: currencyMeta[c]?.note ?? "" };
            return {
                ...prev,
                currencies: next,
                currencyMeta,
                autoConvert: next.includes("ngn") ? prev.autoConvert : false,
            };
        });
    }, []);

    const save = useCallback(
        async (override?: Partial<PricingListData>) => {
            if (!list) return;
            setSaving(true);
            try {
                const body = { ...list, ...override };
                const r = await fetch(`/api/admin/finance/pricelists/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                const j = await r.json();
                if (!r.ok) throw new Error(j.error || "Save failed");
                setList(j.list);
                toast.success("Saved");
                return j.list as PricingListData;
            } catch (e) {
                toast.error(e instanceof Error ? e.message : "Save failed");
            } finally {
                setSaving(false);
            }
        },
        [id, list],
    );

    const addCurrency = useCallback(
        async (file: File) => {
            setUploading(true);
            const t = toast.loading("Reading PDF and merging currency…");
            try {
                const fd = new FormData();
                fd.append("file", file);
                fd.append("listId", id);
                const r = await fetch("/api/admin/finance/pricelists/parse", { method: "POST", body: fd });
                const j = await r.json();
                if (!r.ok) throw new Error(j.error || "Extraction failed");
                setList(j.list);
                toast.success(`Merged ${j.currency?.toUpperCase()} - review, then Save`, { id: t });
                (j.report ?? []).forEach((m: string) => toast.message(m));
                (j.warnings ?? []).forEach((w: string) => toast.warning(w));
            } catch (e) {
                toast.error(e instanceof Error ? e.message : "Merge failed", { id: t });
            } finally {
                setUploading(false);
                if (fileRef.current) fileRef.current.value = "";
            }
        },
        [id],
    );

    if (loading) {
        return (
            <FinanceShell title="Pricelist" back={{ href: "/admin/finance/pricelists", label: "Pricelists" }}>
                <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
            </FinanceShell>
        );
    }
    if (!list) {
        return (
            <FinanceShell title="Pricelist" back={{ href: "/admin/finance/pricelists", label: "Pricelists" }}>
                <div className={`${glassCard} py-16 text-center text-gray-500`}>Pricelist not found.</div>
            </FinanceShell>
        );
    }

    const currencies = CURRENCY_ORDER.filter((c) => list.currencies.includes(c));
    const isMatrix = listKind(list) === "matrix";

    return (
        <FinanceShell
            title={list.title || "Pricelist"}
            subtitle={list.published ? "Published - live for clients" : "Draft - not visible to clients yet"}
            back={{ href: "/admin/finance/pricelists", label: "Pricelists" }}
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) addCurrency(f); }} />
                    <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-blue-300 disabled:opacity-60">
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Add currency PDF
                    </button>
                    <button type="button" onClick={() => save({ published: !list.published })} disabled={saving}
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${list.published ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700"}`}>
                        {list.published ? <EyeOff className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                        {list.published ? "Unpublish" : "Publish"}
                    </button>
                    <button type="button" onClick={() => save()} disabled={saving}
                        className="inline-flex items-center gap-2 rounded-full bg-[#0A4FE8] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-[#083FC2] disabled:opacity-60">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                    </button>
                </div>
            }
        >
            {/* Share links */}
            <div className={`${glassCard} mb-6 p-5`}>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    <Lock className="h-4 w-4 text-blue-600" /> Client links
                </p>
                <p className="mt-1 text-xs text-gray-500">Each link locks the client to that one currency - they won&apos;t see the others.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {currencies.map((c) => {
                        const link = `${SITE_URL}/pricing/${list.slug}?c=${c}`;
                        return (
                            <div key={c} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs">
                                <span className="font-bold text-gray-700">{CURRENCIES[c].flag} {CURRENCIES[c].symbol}</span>
                                <button type="button" onClick={() => { navigator.clipboard.writeText(link); toast.success(`${CURRENCIES[c].symbol} link copied`); }}
                                    className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800"><Link2 className="h-3.5 w-3.5" /> Copy</button>
                                <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900"><ExternalLink className="h-3.5 w-3.5" /> Open</a>
                            </div>
                        );
                    })}
                </div>
                {!list.published && <p className="mt-2 text-xs text-amber-600">Links work once the pricelist is published.</p>}
            </div>

            {/* Meta */}
            <Section title="Details">
                <div className="mb-4">
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600">Currencies</label>
                    <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1">
                        {CURRENCY_ORDER.map((c) => {
                            const active = list.currencies.includes(c);
                            return (
                                <button key={c} type="button" onClick={() => toggleCurrency(c)} aria-pressed={active}
                                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${active ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>
                                    {CURRENCIES[c].flag} {CURRENCIES[c].symbol}
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-1.5 text-xs text-gray-500">
                        Pick one for a single-currency document, or several for a client currency toggle.
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label="Title"><Input value={list.title} onChange={(v) => patch({ title: v })} /></Field>
                    <Field label="Slug (URL)"><Input value={list.slug} onChange={(v) => patch({ slug: slugify(v) })} /></Field>
                    <Field label="Effective date"><Input value={list.effectiveDate} onChange={(v) => patch({ effectiveDate: v })} /></Field>
                    <Field label="Tagline"><Input value={list.tagline} onChange={(v) => patch({ tagline: v })} /></Field>
                    <Field label="Email"><Input value={list.email} onChange={(v) => patch({ email: v })} /></Field>
                    <Field label="Website"><Input value={list.website} onChange={(v) => patch({ website: v })} /></Field>
                    <Field label="Subtitle" full><Textarea value={list.subtitle} onChange={(v) => patch({ subtitle: v })} rows={2} /></Field>
                    <Field label="Client-facing note" full><Textarea value={list.contextNote} onChange={(v) => patch({ contextNote: v })} rows={3} /></Field>
                </div>
                {/* per-currency market/note */}
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    {currencies.map((c) => (
                        <div key={c} className={`${solidCard} p-3`}>
                            <p className="mb-2 text-xs font-bold text-gray-700">{CURRENCIES[c].flag} {CURRENCIES[c].name}</p>
                            <Input placeholder="Market line" value={list.currencyMeta?.[c]?.market ?? ""}
                                onChange={(v) => patch({ currencyMeta: { ...list.currencyMeta, [c]: { ...list.currencyMeta?.[c], market: v } } })} />
                            <div className="h-2" />
                            <Textarea placeholder="Localisation note" rows={2} value={list.currencyMeta?.[c]?.note ?? ""}
                                onChange={(v) => patch({ currencyMeta: { ...list.currencyMeta, [c]: { ...list.currencyMeta?.[c], note: v } } })} />
                        </div>
                    ))}
                </div>
            </Section>

            {/* Auto-conversion - only when NGN (the base) is one of the currencies */}
            {list.currencies.includes("ngn") && (
            <div className={`${glassCard} mb-6 p-5`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                            <Calculator className="h-5 w-5" />
                        </span>
                        <div>
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                <input type="checkbox" checked={!!list.autoConvert} onChange={(e) => setAutoConvert(e.target.checked)} />
                                Auto-convert USD &amp; RWF from NGN
                            </label>
                            <p className="mt-1 text-xs text-gray-600">
                                Enter Naira and USD auto-fills at <b>{CURRENCY_MULTIPLIERS.usd}×</b> the conversion,
                                RWF at <b>{CURRENCY_MULTIPLIERS.rwf}×</b>. Rates: 1&nbsp;USD = {CONVERSION_RATES.ngnPerUsd.toLocaleString()}&nbsp;NGN,
                                1&nbsp;NGN = {CONVERSION_RATES.rwfPerNgn}&nbsp;RWF (edit in <code>src/lib/pricing/conversion.ts</code>).
                            </p>
                        </div>
                    </div>
                    {list.autoConvert && (
                        <button type="button" onClick={recalcAll}
                            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 hover:border-blue-300">
                            <RefreshCw className="h-4 w-4" /> Recalculate from NGN
                        </button>
                    )}
                </div>
            </div>
            )}

            {isMatrix ? (
                /* Matrix (table) editor */
                <Section title="Price table" action={null}>
                    <MatrixEditor
                        matrix={list.matrix ?? { rowLabel: "Item", variants: [], rows: [], notes: [] }}
                        currencies={currencies}
                        autoConvert={!!list.autoConvert}
                        onChange={(m) => patch({ matrix: m })}
                    />
                </Section>
            ) : (
                <>
                    {/* Packages */}
                    <Section title={`Packages (${list.packages.length})`}
                        action={<AddBtn onClick={() => patch({ packages: [...list.packages, blankPackage()] })} label="Add package" />}>
                        <div className="flex flex-col gap-4">
                            {list.packages.map((pkg, i) => (
                                <PackageEditor key={i} pkg={pkg} currencies={currencies} autoConvert={!!list.autoConvert}
                                    onChange={(np) => patch({ packages: list.packages.map((p, j) => (j === i ? np : p)) })}
                                    onDelete={() => patch({ packages: list.packages.filter((_, j) => j !== i) })} />
                            ))}
                        </div>
                    </Section>

                    {/* Add-ons */}
                    <Section title={`Add-ons (${list.addOns.length})`}
                        action={<AddBtn onClick={() => patch({ addOns: [...list.addOns, { name: "", price: { amounts: {} } }] })} label="Add add-on" />}>
                        <div className="flex flex-col gap-2">
                            {list.addOns.map((a, i) => (
                                <AddOnEditor key={i} addon={a} currencies={currencies} autoConvert={!!list.autoConvert}
                                    onChange={(na) => patch({ addOns: list.addOns.map((x, j) => (j === i ? na : x)) })}
                                    onDelete={() => patch({ addOns: list.addOns.filter((_, j) => j !== i) })} />
                            ))}
                        </div>
                    </Section>
                </>
            )}

            {/* Recommended paths */}
            <Section title="Recommended path"
                action={<AddBtn onClick={() => patch({ recommendedPaths: [...list.recommendedPaths, { when: "", choose: "" }] })} label="Add row" />}>
                <div className="flex flex-col gap-2">
                    {list.recommendedPaths.map((row, i) => (
                        <PairRow key={i} a={row.when} b={row.choose} aPlaceholder="When…" bPlaceholder="Choose…"
                            onA={(v) => patch({ recommendedPaths: list.recommendedPaths.map((x, j) => (j === i ? { ...x, when: v } : x)) })}
                            onB={(v) => patch({ recommendedPaths: list.recommendedPaths.map((x, j) => (j === i ? { ...x, choose: v } : x)) })}
                            onDelete={() => patch({ recommendedPaths: list.recommendedPaths.filter((_, j) => j !== i) })} />
                    ))}
                </div>
            </Section>

            {/* Delivery process */}
            <Section title="Delivery process"
                action={<AddBtn onClick={() => patch({ deliveryProcess: [...list.deliveryProcess, { title: "", detail: "" }] })} label="Add step" />}>
                <div className="flex flex-col gap-2">
                    {list.deliveryProcess.map((row, i) => (
                        <PairRow key={i} a={row.title} b={row.detail} aPlaceholder="Step title…" bPlaceholder="Detail…"
                            onA={(v) => patch({ deliveryProcess: list.deliveryProcess.map((x, j) => (j === i ? { ...x, title: v } : x)) })}
                            onB={(v) => patch({ deliveryProcess: list.deliveryProcess.map((x, j) => (j === i ? { ...x, detail: v } : x)) })}
                            onDelete={() => patch({ deliveryProcess: list.deliveryProcess.filter((_, j) => j !== i) })} />
                    ))}
                </div>
            </Section>

            {/* Terms */}
            <Section title="Payment, terms & scope"
                action={<AddBtn onClick={() => patch({ terms: [...list.terms, { label: "", detail: "" }] })} label="Add term" />}>
                <div className="flex flex-col gap-2">
                    {list.terms.map((row, i) => (
                        <PairRow key={i} a={row.label} b={row.detail} aPlaceholder="Label…" bPlaceholder="Detail…"
                            onA={(v) => patch({ terms: list.terms.map((x, j) => (j === i ? { ...x, label: v } : x)) })}
                            onB={(v) => patch({ terms: list.terms.map((x, j) => (j === i ? { ...x, detail: v } : x)) })}
                            onDelete={() => patch({ terms: list.terms.filter((_, j) => j !== i) })} />
                    ))}
                </div>
            </Section>

            <div className="mt-8 flex justify-end">
                <button type="button" onClick={() => save()} disabled={saving}
                    className="inline-flex items-center gap-2 rounded-full bg-[#0A4FE8] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-[#083FC2] disabled:opacity-60">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
                </button>
            </div>
        </FinanceShell>
    );
}

/* ---------- sub-components ---------- */

function blankPackage(): PricingPackage {
    return { id: crypto.randomUUID().slice(0, 8), name: "", tagline: "", price: { amounts: {} }, bestFor: "", timeline: "", revision: "", deliverables: [], notIncluded: "" };
}

function PackageEditor({ pkg, currencies, autoConvert, onChange, onDelete }: {
    pkg: PricingPackage; currencies: CurrencyCode[]; autoConvert: boolean;
    onChange: (p: PricingPackage) => void; onDelete: () => void;
}) {
    const setAmount = (c: CurrencyCode, v: string) => {
        if (autoConvert && c === "ngn") {
            const { usd, rwf } = convertFromNgn(v);
            onChange({ ...pkg, price: { ...pkg.price, amounts: { ...pkg.price.amounts, ngn: v, usd, rwf } } });
        } else {
            onChange({ ...pkg, price: { ...pkg.price, amounts: { ...pkg.price.amounts, [c]: v } } });
        }
    };
    return (
        <div className={`${solidCard} p-4`}>
            <div className="flex items-start gap-3">
                <div className="flex-1 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field label="Name"><Input value={pkg.name} onChange={(v) => onChange({ ...pkg, name: v })} /></Field>
                    <Field label="Tagline"><Input value={pkg.tagline} onChange={(v) => onChange({ ...pkg, tagline: v })} /></Field>
                </div>
                <button type="button" onClick={onDelete} className="mt-6 shrink-0 rounded-lg border border-gray-200 p-2 text-red-600 hover:border-red-300"><Trash2 className="h-4 w-4" /></button>
            </div>

            {/* prices per currency */}
            <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                    <input type="checkbox" checked={!!pkg.price.from} onChange={(e) => onChange({ ...pkg, price: { ...pkg.price, from: e.target.checked } })} /> “From” price
                </label>
                {currencies.map((c) => {
                    const readOnly = autoConvert && c !== "ngn";
                    return (
                        <Field key={c} label={readOnly ? `${CURRENCIES[c].symbol} · auto` : CURRENCIES[c].symbol}>
                            <Input placeholder={c === "ngn" ? "e.g. 230,000" : "auto"} readOnly={readOnly}
                                value={pkg.price.amounts[c] ?? ""} onChange={(v) => setAmount(c, v)} />
                        </Field>
                    );
                })}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Timeline"><Input value={pkg.timeline} onChange={(v) => onChange({ ...pkg, timeline: v })} /></Field>
                <Field label="Revision"><Input value={pkg.revision} onChange={(v) => onChange({ ...pkg, revision: v })} /></Field>
                <Field label="Popular?">
                    <label className="flex h-[38px] items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={!!pkg.popular} onChange={(e) => onChange({ ...pkg, popular: e.target.checked })} /> Mark “Most chosen”
                    </label>
                </Field>
            </div>
            <Field label="Best for" full><Textarea rows={2} value={pkg.bestFor} onChange={(v) => onChange({ ...pkg, bestFor: v })} /></Field>
            <Field label="Deliverables (one per line)" full>
                <Textarea rows={5} value={pkg.deliverables.join("\n")}
                    onChange={(v) => onChange({ ...pkg, deliverables: v.split("\n").map((s) => s.trim()).filter(Boolean) })} />
            </Field>
            <Field label="Not included" full><Textarea rows={2} value={pkg.notIncluded} onChange={(v) => onChange({ ...pkg, notIncluded: v })} /></Field>
        </div>
    );
}

function AddOnEditor({ addon, currencies, autoConvert, onChange, onDelete }: {
    addon: AddOn; currencies: CurrencyCode[]; autoConvert: boolean;
    onChange: (a: AddOn) => void; onDelete: () => void;
}) {
    const isPolicy = !!addon.text;
    const setPolicy = (policy: boolean) => {
        if (policy) onChange({ name: addon.name, text: {} });
        else onChange({ name: addon.name, price: { amounts: {} } });
    };
    const setPriceAmount = (c: CurrencyCode, v: string) => {
        const base = addon.price ?? { amounts: {} };
        if (autoConvert && c === "ngn") {
            const { usd, rwf } = convertFromNgn(v);
            onChange({ ...addon, price: { ...base, amounts: { ...base.amounts, ngn: v, usd, rwf } } });
        } else {
            onChange({ ...addon, price: { ...base, amounts: { ...base.amounts, [c]: v } } });
        }
    };
    return (
        <div className={`${solidCard} flex flex-col gap-2 p-3`}>
            <div className="flex items-center gap-2">
                <Input placeholder="Add-on name" value={addon.name} onChange={(v) => onChange({ ...addon, name: v })} />
                <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-gray-600">
                    <input type="checkbox" checked={isPolicy} onChange={(e) => setPolicy(e.target.checked)} /> Policy text
                </label>
                <button type="button" onClick={onDelete} className="shrink-0 rounded-lg border border-gray-200 p-2 text-red-600 hover:border-red-300"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
                {!isPolicy && (
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                        <input type="checkbox" checked={!!addon.price?.from} onChange={(e) => onChange({ ...addon, price: { ...(addon.price ?? { amounts: {} }), from: e.target.checked } })} /> “From”
                    </label>
                )}
                {currencies.map((c) => {
                    const readOnly = !isPolicy && autoConvert && c !== "ngn";
                    return (
                        <Field key={c} label={readOnly ? `${CURRENCIES[c].symbol} · auto` : CURRENCIES[c].symbol}>
                            {isPolicy ? (
                                <Input placeholder="e.g. +30% to +50% of project fee" value={addon.text?.[c] ?? ""}
                                    onChange={(v) => onChange({ ...addon, text: { ...addon.text, [c]: v } })} />
                            ) : (
                                <Input placeholder={c === "ngn" ? "e.g. 250,000" : "auto"} readOnly={readOnly}
                                    value={addon.price?.amounts?.[c] ?? ""} onChange={(v) => setPriceAmount(c, v)} />
                            )}
                        </Field>
                    );
                })}
            </div>
        </div>
    );
}

function MatrixEditor({ matrix, currencies, autoConvert, onChange }: {
    matrix: MatrixData; currencies: CurrencyCode[]; autoConvert: boolean; onChange: (m: MatrixData) => void;
}) {
    const setCell = (rowIdx: number, vid: string, cell: MatrixData["rows"][number]["cells"][string]) =>
        onChange({ ...matrix, rows: matrix.rows.map((r, i) => (i === rowIdx ? { ...r, cells: { ...r.cells, [vid]: cell } } : r)) });

    const setAmount = (rowIdx: number, vid: string, c: CurrencyCode, v: string) => {
        const cell = matrix.rows[rowIdx].cells[vid] ?? { amounts: {} };
        if (autoConvert && c === "ngn") {
            const { usd, rwf } = convertFromNgn(v);
            setCell(rowIdx, vid, { amounts: { ...cell.amounts, ngn: v, usd, rwf } });
        } else {
            setCell(rowIdx, vid, { amounts: { ...cell.amounts, [c]: v } });
        }
    };
    const toggleQuote = (rowIdx: number, vid: string, on: boolean) =>
        setCell(rowIdx, vid, on ? { amounts: {}, note: "Quote required" } : { amounts: {} });

    return (
        <div className="flex flex-col gap-5">
            {/* Row label + options (columns) */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Row header (e.g. Size)"><Input value={matrix.rowLabel} onChange={(v) => onChange({ ...matrix, rowLabel: v })} /></Field>
            </div>

            <div>
                <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-600">Options / materials (columns) - clients toggle these</label>
                    <AddBtn label="Add option" onClick={() => onChange({ ...matrix, variants: [...matrix.variants, { id: crypto.randomUUID().slice(0, 8), name: "" }] })} />
                </div>
                <div className="flex flex-col gap-2">
                    {matrix.variants.map((v, i) => (
                        <div key={v.id} className="flex items-center gap-2">
                            <Input placeholder="Option name, e.g. Matte Finish" value={v.name}
                                onChange={(val) => onChange({ ...matrix, variants: matrix.variants.map((x, j) => (j === i ? { ...x, name: val } : x)) })} />
                            <button type="button" onClick={() => onChange({
                                ...matrix,
                                variants: matrix.variants.filter((_, j) => j !== i),
                                rows: matrix.rows.map((r) => { const c = { ...r.cells }; delete c[v.id]; return { ...r, cells: c }; }),
                            })} className="shrink-0 rounded-lg border border-gray-200 p-2 text-red-600 hover:border-red-300"><Trash2 className="h-4 w-4" /></button>
                        </div>
                    ))}
                    {matrix.variants.length === 0 && <p className="text-xs text-gray-400">Add at least one option (e.g. a material or finish).</p>}
                </div>
            </div>

            {/* Rows */}
            <div>
                <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-600">Rows ({matrix.rows.length})</label>
                    <AddBtn label="Add row" onClick={() => onChange({ ...matrix, rows: [...matrix.rows, { label: "", cells: {} }] })} />
                </div>
                <div className="flex flex-col gap-3">
                    {matrix.rows.map((row, ri) => (
                        <div key={ri} className={`${solidCard} p-3`}>
                            <div className="flex items-center gap-2">
                                <Input placeholder={matrix.rowLabel || "Row label"} value={row.label}
                                    onChange={(v) => onChange({ ...matrix, rows: matrix.rows.map((r, j) => (j === ri ? { ...r, label: v } : r)) })} />
                                <button type="button" onClick={() => onChange({ ...matrix, rows: matrix.rows.filter((_, j) => j !== ri) })}
                                    className="shrink-0 rounded-lg border border-gray-200 p-2 text-red-600 hover:border-red-300"><Trash2 className="h-4 w-4" /></button>
                            </div>
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {matrix.variants.map((v) => {
                                    const cell = row.cells[v.id];
                                    const isQuote = !!cell?.note;
                                    return (
                                        <div key={v.id} className="rounded-lg bg-white p-2 ring-1 ring-gray-100">
                                            <div className="mb-1 flex items-center justify-between">
                                                <span className="text-[11px] font-semibold text-gray-600">{v.name || "Option"}</span>
                                                <label className="flex items-center gap-1 text-[11px] font-semibold text-gray-500">
                                                    <input type="checkbox" checked={isQuote} onChange={(e) => toggleQuote(ri, v.id, e.target.checked)} /> Quote
                                                </label>
                                            </div>
                                            {!isQuote && (
                                                <div className="flex flex-wrap items-end gap-1.5">
                                                    {currencies.map((c) => {
                                                        const readOnly = autoConvert && c !== "ngn";
                                                        return (
                                                            <div key={c} className="min-w-[90px] flex-1">
                                                                <label className="mb-0.5 block text-[10px] font-semibold text-gray-400">{CURRENCIES[c].symbol}{readOnly ? " · auto" : ""}</label>
                                                                <Input placeholder={c === "ngn" ? "5,200" : "auto"} readOnly={readOnly}
                                                                    value={cell?.amounts?.[c] ?? ""} onChange={(val) => setAmount(ri, v.id, c, val)} />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Notes */}
            <div>
                <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-600">Footnotes</label>
                    <AddBtn label="Add note" onClick={() => onChange({ ...matrix, notes: [...matrix.notes, ""] })} />
                </div>
                <div className="flex flex-col gap-2">
                    {matrix.notes.map((n, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <Input placeholder="e.g. 5x7 has been removed from this price list." value={n}
                                onChange={(v) => onChange({ ...matrix, notes: matrix.notes.map((x, j) => (j === i ? v : x)) })} />
                            <button type="button" onClick={() => onChange({ ...matrix, notes: matrix.notes.filter((_, j) => j !== i) })}
                                className="shrink-0 rounded-lg border border-gray-200 p-2 text-red-600 hover:border-red-300"><Trash2 className="h-4 w-4" /></button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function PairRow({ a, b, aPlaceholder, bPlaceholder, onA, onB, onDelete }: {
    a: string; b: string; aPlaceholder: string; bPlaceholder: string;
    onA: (v: string) => void; onB: (v: string) => void; onDelete: () => void;
}) {
    return (
        <div className="flex items-start gap-2">
            <div className="w-1/3"><Input placeholder={aPlaceholder} value={a} onChange={onA} /></div>
            <div className="flex-1"><Textarea rows={2} placeholder={bPlaceholder} value={b} onChange={onB} /></div>
            <button type="button" onClick={onDelete} className="rounded-lg border border-gray-200 p-2 text-red-600 hover:border-red-300"><Trash2 className="h-4 w-4" /></button>
        </div>
    );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className={`${glassCard} mb-6 p-5`}>
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">{title}</h2>
                {action}
            </div>
            {children}
        </div>
    );
}

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
    return (
        <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 hover:border-blue-300">
            <Plus className="h-3.5 w-3.5" /> {label}
        </button>
    );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
    return (
        <div className={full ? "md:col-span-2" : ""}>
            <label className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>
            {children}
        </div>
    );
}

function Input({ value, onChange, placeholder, readOnly }: { value: string; onChange: (v: string) => void; placeholder?: string; readOnly?: boolean }) {
    return (
        <input value={value} placeholder={placeholder} readOnly={readOnly}
            onChange={(e) => !readOnly && onChange(e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${readOnly ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-500" : "border-gray-200 bg-white text-gray-900"}`} />
    );
}

function Textarea({ value, onChange, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
    return (
        <textarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
            className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
    );
}
