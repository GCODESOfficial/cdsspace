"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Plus,
    Search,
    FileText,
    Eye,
    Trash2,
    Copy,
    Check,
    Share2,
    Archive,
    X,
    Pencil,
    Receipt,
    Briefcase,
    MoreHorizontal,
    Files,
    RotateCcw,
    UserRoundCheck,
    UserMinus,
    Loader2,
} from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import StatCard from "@/components/finance/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { appAlert, appConfirm } from "@/lib/app-notify";
import { BrandBriefShareModal, type BrandBriefSharePayload } from "@/components/admin/BrandBriefShareModal";
import type { BrandBrief } from "@/lib/brand-brief";

const STATUS_STYLES: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    submitted: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    archived: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

type StatusFilter = "all" | "pending" | "submitted" | "archived";
type ClientAccountOption = { id: string; email: string | null; full_name: string | null; company_name: string | null };

function relativeTime(iso: string | null | undefined): string {
    if (!iso) return "-";
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    return d.toLocaleDateString();
}

export default function AdminBrandBriefsPage() {
    const router = useRouter();
    const [rows, setRows] = useState<BrandBrief[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [creating, setCreating] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [inviteLabel, setInviteLabel] = useState("");
    const [inviteNote, setInviteNote] = useState("");
    const [share, setShare] = useState<BrandBriefSharePayload | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [working, setWorking] = useState(false);
    const [menuFor, setMenuFor] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [attachBrief, setAttachBrief] = useState<BrandBrief | null>(null);
    const [clientSearch, setClientSearch] = useState("");
    const [clientOptions, setClientOptions] = useState<ClientAccountOption[]>([]);
    const [clientsLoading, setClientsLoading] = useState(false);
    const [attaching, setAttaching] = useState(false);

    const load = useCallback((silent = false) => {
        if (!silent) setLoading(true);
        setLoadError(null);
        fetch("/api/admin/brand-briefs", { cache: "no-store" })
            .then(async (r) => {
                const d = await r.json().catch(() => ({}));
                // Surface a real failure instead of silently rendering an empty
                // list (which reads as "no briefs" and looks like data loss).
                if (!r.ok) throw new Error(d.error || `Couldn't load briefs (${r.status}).`);
                setRows(d.briefs ?? []);
            })
            .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load briefs."))
            .finally(() => { if (!silent) setLoading(false); });
    }, []);
    useEffect(() => {
        load();
        const refresh = () => { if (document.visibilityState === "visible") load(true); };
        const interval = window.setInterval(refresh, 30_000);
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [load]);

    // Close the row menu on outside click / ESC
    useEffect(() => {
        if (!menuFor) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuFor(null);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [menuFor]);

    useEffect(() => {
        if (!attachBrief) return;
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setClientsLoading(true);
            fetch(`/api/admin/brand-briefs/clients?q=${encodeURIComponent(clientSearch.trim())}`, { cache: "no-store", signal: controller.signal })
                .then(async (response) => {
                    const payload = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(payload.error || "Could not load client accounts.");
                    setClientOptions(payload.clients || []);
                })
                .catch((error) => { if (error?.name !== "AbortError") void appAlert(error.message || "Could not load client accounts."); })
                .finally(() => setClientsLoading(false));
        }, 200);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [attachBrief, clientSearch]);

    const attachToClient = async (clientUserId: string | null) => {
        if (!attachBrief) return;
        setAttaching(true);
        try {
            const response = await fetch(`/api/admin/brand-briefs/${attachBrief.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ client_user_id: clientUserId }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || "Could not attach this brief.");
            setAttachBrief(null);
            setClientSearch("");
            load(true);
            await appAlert(clientUserId ? "Brand brief attached to the client account." : "Brand brief detached from the client account.");
        } catch (error) {
            await appAlert(error instanceof Error ? error.message : "Could not attach this brief.");
        } finally {
            setAttaching(false);
        }
    };

    const create = async () => {
        setCreating(true);
        try {
            const r = await fetch("/api/admin/brand-briefs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    invite_label: inviteLabel.trim() || null,
                    invite_note: inviteNote.trim() || null,
                }),
            });
            const d = await r.json();
            if (!r.ok) {
                appAlert(d.error || "Failed to create brief link.");
                return;
            }
            setInviteLabel("");
            setInviteNote("");
            setShowCreate(false);
            load();
            setShare({
                id: d.brief.id,
                invite_label: d.brief.invite_label,
                invite_note: d.brief.invite_note,
                public_token: d.brief.public_token,
                origin: window.location.origin,
            });
        } finally {
            setCreating(false);
        }
    };

    const copyLink = async (b: BrandBrief) => {
        const url = `${window.location.origin}/brand-brief/${b.public_token}`;
        await navigator.clipboard.writeText(url);
        setCopiedId(b.id);
        setTimeout(() => setCopiedId((v) => (v === b.id ? null : v)), 1500);
    };

    const openShare = (b: BrandBrief) => {
        setShare({
            id: b.id,
            invite_label: b.invite_label,
            invite_note: b.invite_note,
            public_token: b.public_token,
            origin: window.location.origin,
        });
    };

    const archiveOne = async (b: BrandBrief) => {
        if (!(await appConfirm("Archive this brief link? Clients with the link won't be able to use it."))) return;
        await fetch(`/api/admin/brand-briefs/${b.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "archived" }),
        });
        load();
    };

    const removeOne = async (b: BrandBrief) => {
        if (!(await appConfirm("Permanently delete this brief?"))) return;
        await fetch(`/api/admin/brand-briefs/${b.id}`, { method: "DELETE" });
        load();
    };

    const generateInvoice = async (b: BrandBrief) => {
        setMenuFor(null);
        if (b.status !== "submitted") {
            if (!(await appConfirm("This brief hasn't been submitted yet. Generate an invoice from the current data anyway?"))) return;
        }
        setWorking(true);
        try {
            const r = await fetch(`/api/admin/brand-briefs/${b.id}/generate-invoice`, { method: "POST" });
            const d = await r.json();
            if (!r.ok) {
                appAlert(d.error || "Couldn't generate invoice.");
                return;
            }
            router.push(`/admin/finance/invoices/new?draft=${d.invoice.id}`);
        } finally {
            setWorking(false);
        }
    };

    const createProject = async (b: BrandBrief) => {
        setMenuFor(null);
        setWorking(true);
        try {
            const r = await fetch(`/api/admin/brand-briefs/${b.id}/create-project`, { method: "POST" });
            const d = await r.json();
            if (!r.ok) {
                appAlert(d.error || "Couldn't create project.");
                return;
            }
            router.push(`/admin/projects/list`);
        } finally {
            setWorking(false);
        }
    };

    const duplicateBrief = async (b: BrandBrief) => {
        setMenuFor(null);
        setWorking(true);
        try {
            const r = await fetch(`/api/admin/brand-briefs/${b.id}/duplicate`, { method: "POST" });
            const d = await r.json();
            if (!r.ok) {
                appAlert(d.error || "Couldn't duplicate brief.");
                return;
            }
            // Open the share modal for the new blank brief so the admin can
            // immediately send it out.
            load();
            setShare({
                id: d.brief.id,
                invite_label: d.brief.invite_label,
                invite_note: d.brief.invite_note,
                public_token: d.brief.public_token,
                origin: window.location.origin,
            });
        } finally {
            setWorking(false);
        }
    };

    const reactivateBrief = async (b: BrandBrief) => {
        setMenuFor(null);
        await fetch(`/api/admin/brand-briefs/${b.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "pending" }),
        });
        load();
    };

    // Bulk helpers
    const toggleOne = (id: string) => {
        setSelected((s) => {
            const n = new Set(s);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
        });
    };
    const toggleAll = (ids: string[]) => {
        setSelected((s) => (ids.every((id) => s.has(id)) ? new Set() : new Set(ids)));
    };
    const clearSelection = () => setSelected(new Set());

    const bulkPatch = async (status: "archived" | "pending") => {
        setWorking(true);
        try {
            await Promise.all(
                Array.from(selected).map((id) =>
                    fetch(`/api/admin/brand-briefs/${id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status }),
                    }),
                ),
            );
        } finally {
            setWorking(false);
            clearSelection();
            load();
        }
    };

    const bulkDelete = async () => {
        if (!(await appConfirm(`Delete ${selected.size} brief${selected.size === 1 ? "" : "s"}? This cannot be undone.`))) return;
        setWorking(true);
        try {
            await Promise.all(
                Array.from(selected).map((id) =>
                    fetch(`/api/admin/brand-briefs/${id}`, { method: "DELETE" }),
                ),
            );
        } finally {
            setWorking(false);
            clearSelection();
            load();
        }
    };

    const bulkCopyLinks = async () => {
        const urls = Array.from(selected)
            .map((id) => rows.find((r) => r.id === id))
            .filter(Boolean)
            .map((b) => `${window.location.origin}/brand-brief/${(b as BrandBrief).public_token}`);
        if (urls.length === 0) return;
        await navigator.clipboard.writeText(urls.join("\n"));
        appAlert(`${urls.length} brief link(s) copied to clipboard.`);
        clearSelection();
    };

    const filtered = rows.filter((r) => {
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        const hay = [r.invite_label, r.brand_name, r.contact_name, r.contact_email]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return hay.includes(search.toLowerCase());
    });

    const counts = rows.reduce(
        (acc, r) => {
            if (r.status === "pending") acc.pending++;
            else if (r.status === "submitted") acc.submitted++;
            else acc.archived++;
            return acc;
        },
        { pending: 0, submitted: 0, archived: 0 },
    );

    return (
        <FinanceShell
            hideNav
            title="Brand Briefs"
            subtitle="Generate shareable brief links - clients fill without creating an account."
            actions={
                <Button
                    onClick={() => setShowCreate(true)}
                    className="h-11 px-5 rounded-xl bg-[#0A4FE8] hover:bg-[#083FC2] shadow-lg shadow-blue-600/20"
                >
                    <Plus className="w-4 h-4 mr-1.5" /> Request New Brand Brief
                </Button>
            }
        >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                <StatCard icon={FileText} label="Total Briefs" value={String(rows.length)} accent="bg-[#0A4FE8]" />
                <StatCard icon={FileText} label="Awaiting response" value={String(counts.pending)} accent="from-amber-500 to-orange-500" />
                <StatCard icon={Check} label="Submitted" value={String(counts.submitted)} accent="from-emerald-500 to-teal-500" />
            </div>

            <div className={`${glassCard} p-4 mb-4 flex items-center gap-3`}>
                <Search className="w-5 h-5 text-gray-400 ml-2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by label, brand, or client…"
                    className="flex-1 bg-transparent outline-none text-sm"
                />
            </div>

            <div className="mb-6 flex items-center gap-2 flex-wrap">
                {([
                    { key: "all", label: "All", count: rows.length },
                    { key: "pending", label: "Pending", count: counts.pending },
                    { key: "submitted", label: "Submitted", count: counts.submitted },
                    { key: "archived", label: "Archived", count: counts.archived },
                ] as const).map((tab) => {
                    const active = statusFilter === tab.key;
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setStatusFilter(tab.key as StatusFilter)}
                            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition border ${
                                active
                                    ? "bg-[#0A4FE8] text-white border-transparent shadow-sm shadow-blue-200"
                                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                            }`}
                        >
                            {tab.label}
                            <span
                                className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                                    active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                                }`}
                            >
                                {tab.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {loading ? (
                <div className={`${glassCard} p-10 text-center text-gray-500`}>Loading…</div>
            ) : loadError ? (
                <div className={`${glassCard} p-10 text-center`}>
                    <h3 className="text-lg font-semibold text-gray-900">Couldn&apos;t load briefs</h3>
                    <p className="text-gray-500 mt-1">{loadError}</p>
                    <button
                        type="button"
                        onClick={() => load()}
                        className="mt-4 text-blue-600 text-sm font-semibold hover:underline"
                    >
                        Retry
                    </button>
                </div>
            ) : filtered.length === 0 ? (
                <div className={`${glassCard} p-14 text-center`}>
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 grid place-items-center mx-auto mb-4">
                        <FileText className="w-7 h-7 text-blue-600" />
                    </div>
                    {rows.length === 0 ? (
                        <>
                            <h3 className="text-lg font-semibold text-gray-900">No brand briefs yet</h3>
                            <p className="text-gray-500 mt-1">Generate a link and send it to a client to get started.</p>
                        </>
                    ) : (
                        <>
                            <h3 className="text-lg font-semibold text-gray-900">No matches</h3>
                            <p className="text-gray-500 mt-1">
                                Nothing fits the current filter{search ? " and search" : ""}.
                            </p>
                            <button
                                type="button"
                                onClick={() => { setStatusFilter("all"); setSearch(""); }}
                                className="mt-4 text-blue-600 text-sm font-semibold hover:underline"
                            >
                                Clear filter
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <>
                    {selected.size > 0 && (
                        <div className={`${glassCard} p-3 mb-4 flex items-center gap-3 border border-blue-200 bg-blue-50/60`}>
                            <div className="flex items-center gap-2 px-2">
                                <span className="w-7 h-7 rounded-lg bg-blue-600 text-white text-xs font-bold grid place-items-center">
                                    {selected.size}
                                </span>
                                <span className="text-sm font-medium text-gray-700">selected</span>
                            </div>
                            <div className="flex items-center gap-2 ml-auto flex-wrap">
                                <button
                                    disabled={working}
                                    onClick={bulkCopyLinks}
                                    className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 transition disabled:opacity-50 inline-flex items-center gap-1.5"
                                >
                                    <Copy className="w-3.5 h-3.5" /> Copy Links
                                </button>
                                <button
                                    disabled={working}
                                    onClick={() => bulkPatch("pending")}
                                    className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 transition disabled:opacity-50 inline-flex items-center gap-1.5"
                                >
                                    Reactivate
                                </button>
                                <button
                                    disabled={working}
                                    onClick={() => bulkPatch("archived")}
                                    className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 transition disabled:opacity-50 inline-flex items-center gap-1.5"
                                >
                                    <Archive className="w-3.5 h-3.5" /> Archive
                                </button>
                                <button
                                    disabled={working}
                                    onClick={bulkDelete}
                                    className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100 transition disabled:opacity-50 inline-flex items-center gap-1.5"
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                </button>
                                <button
                                    onClick={clearSelection}
                                    className="w-8 h-8 rounded-lg hover:bg-white/70 grid place-items-center text-gray-500 hover:text-gray-800"
                                    aria-label="Clear selection"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    <div className={`${glassCard} overflow-visible`}>
                        <table className="w-full text-sm">
                            <thead className="bg-white/50">
                                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                                    <th className="pl-5 pr-2 py-4 w-10">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                                            onChange={() => toggleAll(filtered.map((r) => r.id))}
                                        />
                                    </th>
                                    <th className="px-5 py-4">Label</th>
                                    <th className="px-5 py-4">Brand</th>
                                    <th className="px-5 py-4">Client</th>
                                    <th className="px-5 py-4">Created</th>
                                    <th className="px-5 py-4">Status</th>
                                    <th className="px-5 py-4"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((r) => {
                                    const isSel = selected.has(r.id);
                                    return (
                                        <tr
                                            key={r.id}
                                            className={`border-t border-white/60 transition ${
                                                isSel ? "bg-blue-50/60" : "hover:bg-white/50"
                                            }`}
                                        >
                                            <td className="pl-5 pr-2 py-4">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    checked={isSel}
                                                    onChange={() => toggleOne(r.id)}
                                                />
                                            </td>
                                            <td className="px-5 py-4 font-medium text-[#0D1B39]">
                                                {r.invite_label || <span className="text-gray-400">-</span>}
                                            </td>
                                            <td className="px-5 py-4 text-gray-700">
                                                {r.brand_name || <span className="text-gray-400">-</span>}
                                            </td>
                                            <td className="px-5 py-4 text-gray-700">
                                                {r.contact_name ? (
                                                    <div>
                                                        <div>{r.contact_name}</div>
                                                        {r.contact_email && (
                                                            <div className="text-[11px] text-gray-400">{r.contact_email}</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-gray-500">
                                                {new Date(r.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex flex-col items-start gap-1">
                                                    <span
                                                        className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${
                                                            STATUS_STYLES[r.status] ?? STATUS_STYLES.pending
                                                        }`}
                                                    >
                                                        {r.status}
                                                    </span>
                                                    {r.status === "submitted" && r.submitted_at && (
                                                        <span className="text-[10.5px] text-gray-400">
                                                            {relativeTime(r.submitted_at)}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1 relative">
                                                    <button
                                                        onClick={() => copyLink(r)}
                                                        title="Copy link"
                                                        className="w-8 h-8 rounded-lg hover:bg-gray-100 grid place-items-center text-gray-500 hover:text-blue-600 transition"
                                                    >
                                                        {copiedId === r.id ? (
                                                            <Check className="w-4 h-4 text-emerald-500" />
                                                        ) : (
                                                            <Copy className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => openShare(r)}
                                                        title="Share"
                                                        className="w-8 h-8 rounded-lg hover:bg-gray-100 grid place-items-center text-gray-500 hover:text-blue-600 transition"
                                                    >
                                                        <Share2 className="w-4 h-4" />
                                                    </button>
                                                    <Link
                                                        href={`/admin/brand-briefs/${r.id}`}
                                                        title="View"
                                                        className="w-8 h-8 rounded-lg hover:bg-gray-100 grid place-items-center text-gray-500 hover:text-blue-600 transition"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Link>
                                                    <Link
                                                        href={`/admin/brand-briefs/${r.id}?edit=1`}
                                                        title="Edit"
                                                        className="w-8 h-8 rounded-lg hover:bg-gray-100 grid place-items-center text-gray-500 hover:text-blue-600 transition"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </Link>
                                                    <button
                                                        onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}
                                                        title="More actions"
                                                        className="w-8 h-8 rounded-lg hover:bg-gray-100 grid place-items-center text-gray-500 hover:text-blue-600 transition"
                                                    >
                                                        <MoreHorizontal className="w-4 h-4" />
                                                    </button>
                                                    {menuFor === r.id && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                aria-label="Close menu"
                                                                onClick={() => setMenuFor(null)}
                                                                className="fixed inset-0 z-30 cursor-default"
                                                            />
                                                            <div
                                                                role="menu"
                                                                className="absolute right-0 top-9 z-40 w-60 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden"
                                                            >
                                                                <MenuItem
                                                                    icon={Receipt}
                                                                    label="Generate Invoice"
                                                                    onClick={() => generateInvoice(r)}
                                                                />
                                                                <MenuItem
                                                                    icon={Briefcase}
                                                                    label="Create Project"
                                                                    onClick={() => createProject(r)}
                                                                />
                                                                <MenuItem
                                                                    icon={Files}
                                                                    label="Duplicate"
                                                                    onClick={() => duplicateBrief(r)}
                                                                />
                                                                <MenuItem
                                                                    icon={UserRoundCheck}
                                                                    label={r.client_user_id ? "Reassign client account" : "Attach to client account"}
                                                                    onClick={() => { setMenuFor(null); setAttachBrief(r); setClientSearch(""); }}
                                                                />
                                                                <div className="h-px bg-gray-100" />
                                                                {r.status === "archived" && (
                                                                    <MenuItem
                                                                        icon={RotateCcw}
                                                                        label="Reactivate"
                                                                        onClick={() => reactivateBrief(r)}
                                                                    />
                                                                )}
                                                                {r.status !== "archived" ? (
                                                                    <MenuItem
                                                                        icon={Archive}
                                                                        label="Archive"
                                                                        onClick={() => {
                                                                            setMenuFor(null);
                                                                            archiveOne(r);
                                                                        }}
                                                                    />
                                                                ) : null}
                                                                <MenuItem
                                                                    icon={Trash2}
                                                                    label="Delete"
                                                                    danger
                                                                    onClick={() => {
                                                                        setMenuFor(null);
                                                                        removeOne(r);
                                                                    }}
                                                                />
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Create modal */}
            {showCreate && (
                <div
                    className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => !creating && setShowCreate(false)}
                >
                    <div
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                            <h3 className="text-lg font-bold text-[#0D1B39]">New brand brief</h3>
                            <p className="text-[13px] text-gray-500 mt-0.5">
                                Give this brief a label so you can find it later. Both fields are optional.
                            </p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                                    Label
                                </label>
                                <Input
                                    value={inviteLabel}
                                    onChange={(e) => setInviteLabel(e.target.value)}
                                    placeholder="e.g. Adeesi - rebrand"
                                    className="mt-1.5 h-11 rounded-xl"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                                    Internal note
                                </label>
                                <Textarea
                                    value={inviteNote}
                                    onChange={(e) => setInviteNote(e.target.value)}
                                    placeholder="Only visible to your team."
                                    className="mt-1.5 rounded-xl min-h-[90px]"
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setShowCreate(false)}
                                disabled={creating}
                                className="h-10 rounded-xl"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={create}
                                disabled={creating}
                                className="h-10 px-5 rounded-xl bg-[#0A4FE8] hover:bg-[#083FC2] shadow-lg shadow-blue-600/20"
                            >
                                {creating ? "Creating…" : "Generate link"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {attachBrief && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => !attaching && setAttachBrief(null)}>
                    <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <div className="border-b border-gray-100 px-6 py-5">
                            <h3 className="text-lg font-bold text-[#0D1B39]">Attach brief to a client</h3>
                            <p className="mt-1 text-sm text-gray-500">The submitted brief will appear in the selected client account, so they will not need to complete it again.</p>
                        </div>
                        <div className="p-5">
                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <Input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Search by client, company or email" className="h-11 rounded-xl pl-9" autoFocus />
                            </div>
                            <div className="max-h-[340px] space-y-2 overflow-y-auto">
                                {clientsLoading ? <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" /></div> : clientOptions.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">No client accounts found.</p> : clientOptions.map((client) => (
                                    <button key={client.id} disabled={attaching} onClick={() => void attachToClient(client.id)} className={`flex w-full min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition hover:border-blue-300 hover:bg-blue-50 ${attachBrief.client_user_id === client.id ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}>
                                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#0A4FE8] text-xs font-bold text-white">{(client.full_name || client.company_name || client.email || "C").slice(0, 1).toUpperCase()}</span>
                                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#0D1B39]">{client.full_name || client.company_name || client.email}</span><span className="block truncate text-xs text-gray-500">{[client.company_name, client.email].filter(Boolean).join(" · ")}</span></span>
                                        {attachBrief.client_user_id === client.id && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-4">
                            {attachBrief.client_user_id ? <button disabled={attaching} onClick={() => void attachToClient(null)} className="inline-flex items-center gap-2 text-sm font-semibold text-red-600"><UserMinus className="h-4 w-4" />Detach current client</button> : <span />}
                            <Button variant="outline" disabled={attaching} onClick={() => setAttachBrief(null)} className="rounded-xl">Close</Button>
                        </div>
                    </div>
                </div>
            )}

            <BrandBriefShareModal open={!!share} onClose={() => setShare(null)} payload={share} />
        </FinanceShell>
    );
}

function MenuItem({
    icon: Icon,
    label,
    onClick,
    danger,
}: {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    danger?: boolean;
}) {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition ${
                danger
                    ? "text-red-600 hover:bg-red-50"
                    : "text-[#0D1B39] hover:bg-gray-50"
            }`}
        >
            <Icon className="w-4 h-4" />
            {label}
        </button>
    );
}
