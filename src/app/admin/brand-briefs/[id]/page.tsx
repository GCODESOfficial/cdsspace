"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    Download,
    Share2,
    Copy,
    Check,
    Trash2,
    Pencil,
    X,
    Save,
    Receipt,
    Briefcase,
} from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { appAlert, appConfirm } from "@/lib/app-notify";
import { BrandBriefShareModal, type BrandBriefSharePayload } from "@/components/admin/BrandBriefShareModal";
import {
    ASSET_OPTIONS,
    BRAND_BRIEF_FIELD_LABELS,
    BUDGET_RANGES,
    TIMELINE_OPTIONS,
    briefToDraft,
    type BrandBrief,
    type BrandBriefDraft,
} from "@/lib/brand-brief";

const STATUS_STYLES: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    submitted: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    archived: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

export default function AdminBrandBriefDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const router = useRouter();
    const searchParams = useSearchParams();
    const startInEdit = searchParams.get("edit") === "1";

    const [brief, setBrief] = useState<BrandBrief | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [share, setShare] = useState<BrandBriefSharePayload | null>(null);

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<BrandBriefDraft | null>(null);
    const [inviteLabel, setInviteLabel] = useState("");
    const [inviteNote, setInviteNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [converting, setConverting] = useState(false);

    const load = async () => {
        setLoadError(null);
        try {
            const r = await fetch(`/api/admin/brand-briefs/${id}`);
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                setLoadError(d?.error || `Couldn't load brief (${r.status}).`);
                return;
            }
            const d = await r.json();
            setBrief(d.brief);
            setDraft(briefToDraft(d.brief));
            setInviteLabel(d.brief.invite_label ?? "");
            setInviteNote(d.brief.invite_note ?? "");
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : "Network error");
        }
    };
    useEffect(() => { load(); }, [id]);

    useEffect(() => {
        if (startInEdit && brief) setEditing(true);
    }, [startInEdit, brief]);

    const remove = async () => {
        if (!(await appConfirm("Permanently delete this brief?"))) return;
        const r = await fetch(`/api/admin/brand-briefs/${id}`, { method: "DELETE" });
        if (r.ok) router.push("/admin/brand-briefs");
    };

    const copyLink = async () => {
        if (!brief) return;
        const url = `${window.location.origin}/brand-brief/${brief.public_token}`;
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const download = async () => {
        if (!draft) return;
        const { exportBrandBriefToPdf } = await import("@/lib/brand-brief-pdf");
        exportBrandBriefToPdf(draft, {
            inviteLabel: brief?.invite_label,
            status: brief?.status,
            submittedAt: brief?.submitted_at,
        });
    };

    const cancelEdit = () => {
        if (brief) {
            setDraft(briefToDraft(brief));
            setInviteLabel(brief.invite_label ?? "");
            setInviteNote(brief.invite_note ?? "");
        }
        setEditing(false);
        // Drop the ?edit=1 off the URL
        if (searchParams.get("edit")) router.replace(`/admin/brand-briefs/${id}`);
    };

    const saveEdit = async () => {
        if (!draft) return;
        setSaving(true);
        try {
            const payload = {
                ...draft,
                invite_label: inviteLabel.trim() || null,
                invite_note: inviteNote.trim() || null,
            };
            const r = await fetch(`/api/admin/brand-briefs/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const d = await r.json();
            if (!r.ok) {
                appAlert(d.error || "Couldn't save changes.");
                return;
            }
            setBrief(d.brief);
            setDraft(briefToDraft(d.brief));
            setEditing(false);
            if (searchParams.get("edit")) router.replace(`/admin/brand-briefs/${id}`);
        } finally {
            setSaving(false);
        }
    };

    const generateInvoice = async () => {
        if (!brief) return;
        if (brief.status !== "submitted") {
            if (!(await appConfirm("This brief hasn't been submitted yet. Generate an invoice from the current data anyway?"))) return;
        }
        setConverting(true);
        try {
            const r = await fetch(`/api/admin/brand-briefs/${id}/generate-invoice`, { method: "POST" });
            const d = await r.json();
            if (!r.ok) {
                appAlert(d.error || "Couldn't generate invoice.");
                return;
            }
            router.push(`/admin/finance/invoices/new?draft=${d.invoice.id}`);
        } finally {
            setConverting(false);
        }
    };

    const createProject = async () => {
        if (!brief) return;
        setConverting(true);
        try {
            const r = await fetch(`/api/admin/brand-briefs/${id}/create-project`, { method: "POST" });
            const d = await r.json();
            if (!r.ok) {
                appAlert(d.error || "Couldn't create project.");
                return;
            }
            router.push(`/admin/projects/list`);
        } finally {
            setConverting(false);
        }
    };

    const updateDraft = <K extends keyof BrandBriefDraft>(key: K, value: BrandBriefDraft[K]) => {
        setDraft((d) => (d ? { ...d, [key]: value } : d));
    };

    const toggleAsset = (opt: string) => {
        if (!draft) return;
        setDraft({
            ...draft,
            assets_needed: draft.assets_needed.includes(opt)
                ? draft.assets_needed.filter((x) => x !== opt)
                : [...draft.assets_needed, opt],
        });
    };

    const sections = useMemo(
        () =>
            [
                { title: "The Brand", fields: ["brand_name", "brand_tagline", "industry", "brand_description"] as (keyof BrandBriefDraft)[] },
                { title: "Contact", fields: ["contact_name", "contact_email", "contact_phone"] as (keyof BrandBriefDraft)[] },
                { title: "Audience & Market", fields: ["target_audience", "competitors", "unique_selling_point"] as (keyof BrandBriefDraft)[] },
                { title: "Brand Identity", fields: ["brand_personality", "brand_values", "design_preferences", "inspiration_references"] as (keyof BrandBriefDraft)[] },
                { title: "Scope & Goals", fields: ["assets_needed", "goals", "long_term_vision", "budget_range", "timeline", "additional_notes"] as (keyof BrandBriefDraft)[] },
            ],
        [],
    );

    if (loadError) {
        return (
            <FinanceShell title="Brand Brief" back={{ href: "/admin/brand-briefs", label: "Brand Briefs" }}>
                <div className={`${glassCard} p-8`}>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Couldn't open this brief</h3>
                    <p className="text-gray-600 text-sm mb-4">{loadError}</p>
                    <Button onClick={load} className="h-10 px-4 rounded-xl">Retry</Button>
                </div>
            </FinanceShell>
        );
    }

    if (!brief || !draft) {
        return (
            <FinanceShell title="Loading…">
                <div className={`${glassCard} p-10 text-gray-500`}>Loading brief…</div>
            </FinanceShell>
        );
    }

    const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/brand-brief/${brief.public_token}`;

    return (
        <FinanceShell
            title={brief.brand_name || brief.invite_label || "Brand brief"}
            subtitle={brief.contact_name ?? undefined}
            back={{ href: "/admin/brand-briefs", label: "Brand Briefs" }}
            actions={
                editing ? (
                    <>
                        <Button
                            variant="outline"
                            className="h-11 px-4 rounded-xl"
                            onClick={cancelEdit}
                            disabled={saving}
                        >
                            <X className="w-4 h-4 mr-1.5" /> Cancel
                        </Button>
                        <Button
                            className="h-11 px-4 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30"
                            onClick={saveEdit}
                            disabled={saving}
                        >
                            <Save className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : "Save changes"}
                        </Button>
                    </>
                ) : (
                    <>
                        <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={() => setEditing(true)}>
                            <Pencil className="w-4 h-4 mr-1.5" /> Edit
                        </Button>
                        <Button
                            variant="outline"
                            className="h-11 px-4 rounded-xl"
                            onClick={generateInvoice}
                            disabled={converting}
                        >
                            <Receipt className="w-4 h-4 mr-1.5" /> Generate Invoice
                        </Button>
                        <Button
                            variant="outline"
                            className="h-11 px-4 rounded-xl"
                            onClick={createProject}
                            disabled={converting}
                        >
                            <Briefcase className="w-4 h-4 mr-1.5" /> Create Project
                        </Button>
                        <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={download}>
                            <Download className="w-4 h-4 mr-1.5" /> PDF
                        </Button>
                        <Button
                            variant="outline"
                            className="h-11 px-4 rounded-xl"
                            onClick={() =>
                                setShare({
                                    id: brief.id,
                                    invite_label: brief.invite_label,
                                    invite_note: brief.invite_note,
                                    public_token: brief.public_token,
                                    origin: window.location.origin,
                                })
                            }
                        >
                            <Share2 className="w-4 h-4 mr-1.5" /> Share
                        </Button>
                        <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={remove}>
                            <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                    </>
                )
            }
        >
            {/* Timeline */}
            <div className={`${glassCard} p-5 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4`}>
                <TimelineCell label="Created" value={formatDateTime(brief.created_at)} />
                <TimelineCell label="Last updated" value={formatDateTime(brief.updated_at)} />
                <TimelineCell
                    label="Submitted"
                    value={brief.submitted_at ? formatDateTime(brief.submitted_at) : "-"}
                    accent={brief.submitted_at ? "emerald" : undefined}
                />
                <TimelineCell
                    label="Status"
                    value={brief.status.charAt(0).toUpperCase() + brief.status.slice(1)}
                    accent={
                        brief.status === "submitted"
                            ? "emerald"
                            : brief.status === "archived"
                              ? "slate"
                              : "amber"
                    }
                />
            </div>

            {/* Link + status */}
            <div className={`${glassCard} p-5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                        Public brief link
                    </div>
                    <div className="text-sm font-mono text-gray-700 truncate">{publicUrl}</div>
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${
                            STATUS_STYLES[brief.status] ?? STATUS_STYLES.pending
                        }`}
                    >
                        {brief.status}
                    </span>
                    <Button variant="outline" size="sm" className="rounded-lg" onClick={copyLink}>
                        {copied ? <Check className="w-4 h-4 mr-1 text-emerald-600" /> : <Copy className="w-4 h-4 mr-1" />}
                        {copied ? "Copied" : "Copy"}
                    </Button>
                </div>
            </div>

            {/* Admin-only meta (label + internal note) */}
            <div className={`${glassCard} p-6 mb-6`}>
                <h3 className="text-[11px] uppercase tracking-wider font-bold text-blue-700 mb-4">
                    Admin Notes
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1">Label</p>
                        {editing ? (
                            <Input
                                value={inviteLabel}
                                onChange={(e) => setInviteLabel(e.target.value)}
                                placeholder="e.g. Adeesi - rebrand"
                                className="h-11 rounded-xl"
                            />
                        ) : (
                            <p className="text-[14px] text-[#0D1B39]">
                                {brief.invite_label || <span className="text-gray-400">-</span>}
                            </p>
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1">
                            Internal note
                        </p>
                        {editing ? (
                            <Textarea
                                value={inviteNote}
                                onChange={(e) => setInviteNote(e.target.value)}
                                className="rounded-xl min-h-[90px]"
                            />
                        ) : (
                            <p className="text-[14px] text-[#0D1B39] whitespace-pre-wrap">
                                {brief.invite_note || <span className="text-gray-400">-</span>}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {sections.map((section) => (
                    <div key={section.title} className={`${glassCard} p-6`}>
                        <h3 className="text-[11px] uppercase tracking-wider font-bold text-blue-700 mb-4">
                            {section.title}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {section.fields.map((key) => (
                                <FieldCell
                                    key={String(key)}
                                    fieldKey={key}
                                    draft={draft}
                                    editing={editing}
                                    onChange={updateDraft}
                                    onToggleAsset={toggleAsset}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <BrandBriefShareModal open={!!share} onClose={() => setShare(null)} payload={share} />
        </FinanceShell>
    );
}

function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return "-";
    try {
        return new Date(iso).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

function TimelineCell({
    label,
    value,
    accent,
}: {
    label: string;
    value: string;
    accent?: "emerald" | "amber" | "slate";
}) {
    const accentClass =
        accent === "emerald"
            ? "text-emerald-700"
            : accent === "amber"
              ? "text-amber-700"
              : accent === "slate"
                ? "text-slate-600"
                : "text-[#0D1B39]";
    return (
        <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1.5">{label}</p>
            <p className={`text-[13.5px] font-semibold truncate ${accentClass}`}>{value}</p>
        </div>
    );
}

function FieldCell({
    fieldKey,
    draft,
    editing,
    onChange,
    onToggleAsset,
}: {
    fieldKey: keyof BrandBriefDraft;
    draft: BrandBriefDraft;
    editing: boolean;
    onChange: <K extends keyof BrandBriefDraft>(key: K, value: BrandBriefDraft[K]) => void;
    onToggleAsset: (opt: string) => void;
}) {
    const label = BRAND_BRIEF_FIELD_LABELS[fieldKey] ?? String(fieldKey);
    const raw = draft[fieldKey];

    // Span-2 for long fields
    const spanTwo = [
        "brand_description",
        "target_audience",
        "competitors",
        "unique_selling_point",
        "brand_personality",
        "brand_values",
        "design_preferences",
        "inspiration_references",
        "assets_needed",
        "additional_notes",
    ].includes(fieldKey as string);

    return (
        <div className={`min-w-0 ${spanTwo ? "md:col-span-2" : ""}`}>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1.5">{label}</p>

            {!editing ? (
                <p className="text-[14px] text-[#0D1B39] whitespace-pre-wrap break-words">
                    {Array.isArray(raw)
                        ? raw.length
                            ? raw.join(", ")
                            : <span className="text-gray-400">-</span>
                        : raw?.toString().trim()
                          ? raw.toString()
                          : <span className="text-gray-400">-</span>}
                </p>
            ) : fieldKey === "assets_needed" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ASSET_OPTIONS.map((opt) => {
                        const active = draft.assets_needed.includes(opt);
                        return (
                            <button
                                key={opt}
                                type="button"
                                onClick={() => onToggleAsset(opt)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[13px] font-medium text-left transition ${
                                    active
                                        ? "bg-blue-600 text-white border-transparent"
                                        : "bg-white text-[#0D1B39] border-gray-200 hover:border-blue-300"
                                }`}
                            >
                                <span
                                    className={`w-3.5 h-3.5 rounded-md border flex items-center justify-center shrink-0 ${
                                        active ? "bg-white/20 border-white/40" : "bg-gray-50 border-gray-300"
                                    }`}
                                >
                                    {active && <Check className="w-2.5 h-2.5 text-white" />}
                                </span>
                                {opt}
                            </button>
                        );
                    })}
                </div>
            ) : fieldKey === "budget_range" ? (
                <select
                    value={draft.budget_range}
                    onChange={(e) => onChange("budget_range", e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm bg-white"
                >
                    <option value="">Select</option>
                    {BUDGET_RANGES.map((b) => (
                        <option key={b} value={b}>
                            {b}
                        </option>
                    ))}
                </select>
            ) : fieldKey === "timeline" ? (
                <select
                    value={draft.timeline}
                    onChange={(e) => onChange("timeline", e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm bg-white"
                >
                    <option value="">Select</option>
                    {TIMELINE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
            ) : spanTwo || fieldKey === "brand_description" ? (
                <Textarea
                    value={(raw as string) ?? ""}
                    onChange={(e) => onChange(fieldKey, e.target.value as never)}
                    className="rounded-xl min-h-[90px]"
                />
            ) : (
                <Input
                    value={(raw as string) ?? ""}
                    onChange={(e) => onChange(fieldKey, e.target.value as never)}
                    className="h-11 rounded-xl"
                />
            )}
        </div>
    );
}
