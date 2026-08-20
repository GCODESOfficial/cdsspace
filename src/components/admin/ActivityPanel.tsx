"use client";

import { useEffect, useState } from "react";
import { Loader2, Clock, ShieldCheck } from "lucide-react";
import { activityDetailRows } from "@/lib/activity-metadata";

interface ActivityRow {
    id: string;
    actor_kind: "admin" | "team" | "system";
    actor_name: string;
    actor_is_admin: boolean;
    action: string;
    resource_type: string;
    resource_id: string | null;
    resource_label: string | null;
    page: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

const VERB_LABELS: Record<string, string> = {
    access: "accessed",
    create: "created",
    update: "updated",
    delete: "deleted",
    suspend: "suspended",
    unsuspend: "reactivated",
    promote: "promoted",
    demote: "demoted",
    assign: "assigned",
    unassign: "removed",
    invite: "invited",
    reset_password: "reset password for",
    send: "sent",
    mark_paid: "marked paid",
    restore_version: "restored version for",
    surcharge: "added surcharge to",
    archive: "archived",
    submit: "submitted",
    approve: "approved",
    approve_publish: "approved and published",
    request_revision: "requested revisions for",
    files_uploaded: "uploaded files to",
    draft_saved: "saved a draft for",
    draft_deleted: "deleted a draft for",
    sent_to_client: "sent to the client",
    await_client_account: "secured pending a client account",
    login: "logged in to",
};

function prettyAction(action: string): { verb: string; noun: string } {
    const [noun, verb = "update"] = action.split(".");
    const nounLabel = noun.replace(/_/g, " ");
    const verbLabel = VERB_LABELS[verb] ?? verb.replace(/_/g, " ");
    return { verb: verbLabel, noun: nounLabel };
}

function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
}

/**
 * Per-page activity feed. Drop this component at the bottom of any admin
 * page to render a scoped audit trail - pass the page slug ("team-members",
 * "finance/invoices", etc.) to filter.
 */
export default function ActivityPanel({
    page,
    title = "Activities",
    limit = 30,
    compact = false,
}: {
    page: string;
    title?: string;
    limit?: number;
    compact?: boolean;
}) {
    const [items, setItems] = useState<ActivityRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await fetch(
                    `/api/admin/activity?page=${encodeURIComponent(page)}&limit=${limit}`,
                    { cache: "no-store" },
                );
                const json = await res.json();
                if (!cancelled && json.ok) setItems(json.activities);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [page, limit]);

    return (
        <section
            className={`${compact ? "mt-0" : "mt-10"} border border-gray-100 rounded-2xl bg-white ${compact ? "" : "shadow-xs"}`}
        >
            <header
                className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50 cursor-pointer select-none"
                onClick={() => setCollapsed((c) => !c)}
            >
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#0A4FE8]" />
                    <h2 className="text-[13px] font-bold text-[#0D1B39] tracking-tight">{title}</h2>
                    {!loading && items.length > 0 && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                            {items.length} event{items.length === 1 ? "" : "s"}
                        </span>
                    )}
                </div>
                <span className="text-[10px] font-medium text-gray-400 hover:text-gray-600">
                    {collapsed ? "Show" : "Hide"}
                </span>
            </header>

            {!collapsed && (
                <div className="max-h-[420px] overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
                        </div>
                    ) : items.length === 0 ? (
                        <p className="text-center text-[12px] text-gray-400 py-8 px-4">
                            No activity yet - actions on this page will show up here.
                        </p>
                    ) : (
                        <ul className="divide-y divide-gray-50">
                            {items.map((a) => {
                                const { verb, noun } = prettyAction(a.action);
                                const details = activityDetailRows(a.metadata);
                                return (
                                    <li key={a.id} className="px-5 py-3 flex items-start gap-3 text-[12.5px]">
                                        <div
                                            className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold uppercase ${
                                                a.actor_is_admin
                                                    ? "bg-[#0A4FE8]/10 text-[#0A4FE8]"
                                                    : "bg-gray-100 text-gray-500"
                                            }`}
                                        >
                                            {a.actor_is_admin ? (
                                                <ShieldCheck className="w-3.5 h-3.5" />
                                            ) : (
                                                a.actor_name.charAt(0).toUpperCase()
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[#0D1B39] leading-snug">
                                                <span className="font-semibold">{a.actor_name}</span>
                                                <span className="text-gray-500"> {verb} </span>
                                                <span className="text-gray-500">{noun}</span>
                                                {a.resource_label && (
                                                    <>
                                                        <span className="text-gray-500"> · </span>
                                                        <span className="font-medium text-[#0D1B39] break-words">
                                                            {a.resource_label}
                                                        </span>
                                                    </>
                                                )}
                                            </p>
                                            <p className="text-[10.5px] text-gray-400 mt-0.5">
                                                {timeAgo(a.created_at)} ·{" "}
                                                {new Date(a.created_at).toLocaleString()}
                                            </p>
                                            {details.length > 0 && (
                                                <dl className="mt-2 grid gap-1 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2 sm:grid-cols-2">
                                                    {details.map((detail) => (
                                                        <div key={`${detail.label}-${detail.value}`} className="min-w-0 text-[10.5px] leading-4">
                                                            <dt className="inline font-semibold text-gray-500">{detail.label}: </dt>
                                                            <dd className="inline break-words text-gray-600">{detail.value}</dd>
                                                        </div>
                                                    ))}
                                                </dl>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
}
