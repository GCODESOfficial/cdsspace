"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Wallet,
    Plus,
    Search,
    Check,
    Clock,
    Banknote,
    Inbox,
    Pencil,
    Trash2,
    Download,
    X,
    Users,
} from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import StatCard from "@/components/finance/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { appAlert, appConfirm } from "@/lib/app-notify";

type EntryStatus = "pending" | "approved" | "paid" | "cancelled";
type PeriodType = "monthly" | "weekly" | "bi_weekly" | "one_off";

interface Member {
    id: string;
    full_name: string;
    email: string;
    role_title: string | null;
    department: string | null;
    bank_name: string | null;
    bank_code: string | null;
    account_number: string | null;
    account_name: string | null;
    base_salary: number | null;
    salary_currency: string | null;
    pay_cycle: string | null;
    avatar_url: string | null;
    is_active: boolean;
}

interface Entry {
    id: string;
    team_member_id: string;
    period: string;
    period_type: PeriodType;
    gross_amount: number | string;
    deductions: number | string;
    net_amount: number | string;
    currency: string;
    status: EntryStatus;
    payment_ref: string | null;
    paid_on: string | null;
    scheduled_for: string | null;
    notes: string | null;
    bank_name: string | null;
    bank_code: string | null;
    account_number: string | null;
    account_name: string | null;
    created_at: string;
    team_members: Member | null;
}

interface BankRequest {
    id: string;
    team_member_id: string;
    bank_name: string | null;
    bank_code: string | null;
    account_number: string | null;
    account_name: string | null;
    reason: string | null;
    status: "pending" | "approved" | "rejected" | "cancelled";
    admin_note: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
    team_members: Member | null;
}

const STATUS_STYLES: Record<EntryStatus, string> = {
    pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    approved: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    paid: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    cancelled: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const CURRENCY_SYMBOLS: Record<string, string> = { NGN: "₦", USD: "$", RWF: "FRw " };
function fmtMoney(n: number | string | null | undefined, currency = "NGN") {
    const v = Number(n || 0);
    const sym = CURRENCY_SYMBOLS[currency] ?? "";
    return `${sym}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminTeamPayrollPage() {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [requests, setRequests] = useState<BankRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | EntryStatus>("all");
    const [showCreate, setShowCreate] = useState(false);
    const [editEntry, setEditEntry] = useState<Entry | null>(null);
    const [editMember, setEditMember] = useState<Member | null>(null);
    const [showRequests, setShowRequests] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [entriesRes, membersRes, reqRes] = await Promise.all([
                fetch("/api/admin/team-payroll").then((r) => r.json()),
                fetch("/api/admin/team-members").then((r) => r.json()),
                fetch("/api/admin/team-payroll/bank-requests?status=pending").then((r) => r.json()),
            ]);
            setEntries(entriesRes.entries ?? []);
            setMembers(
                (membersRes.members ?? membersRes.data ?? []).map((m: any) => ({
                    id: m.id,
                    full_name: m.full_name,
                    email: m.email,
                    role_title: m.role_title ?? null,
                    department: m.department ?? null,
                    bank_name: m.bank_name ?? null,
                    bank_code: m.bank_code ?? null,
                    account_number: m.account_number ?? null,
                    account_name: m.account_name ?? null,
                    base_salary: m.base_salary ?? null,
                    salary_currency: m.salary_currency ?? null,
                    pay_cycle: m.pay_cycle ?? null,
                    avatar_url: m.avatar_url ?? null,
                    is_active: m.is_active ?? true,
                })),
            );
            setRequests(reqRes.requests ?? []);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        return entries.filter((e) => {
            if (statusFilter !== "all" && e.status !== statusFilter) return false;
            const hay = [
                e.team_members?.full_name,
                e.team_members?.email,
                e.team_members?.department,
                e.period,
                e.payment_ref,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return hay.includes(search.toLowerCase());
        });
    }, [entries, statusFilter, search]);

    const totals = useMemo(() => {
        return entries.reduce(
            (acc, e) => {
                const n = Number(e.net_amount || 0);
                if (e.status === "paid") acc.paid += n;
                else if (e.status !== "cancelled") acc.outstanding += n;
                return acc;
            },
            { paid: 0, outstanding: 0 },
        );
    }, [entries]);

    const remove = async (e: Entry) => {
        if (!(await appConfirm("Delete this payroll entry?"))) return;
        await fetch(`/api/admin/team-payroll/${e.id}`, { method: "DELETE" });
        load();
    };

    const markPaid = async (e: Entry) => {
        const ref = window.prompt("Payment reference (optional):") ?? "";
        await fetch(`/api/admin/team-payroll/${e.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "paid", payment_ref: ref || null }),
        });
        load();
    };

    const approve = async (e: Entry) => {
        await fetch(`/api/admin/team-payroll/${e.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "approved" }),
        });
        load();
    };

    const exportCsv = () => {
        const rows = [
            [
                "period",
                "member",
                "email",
                "department",
                "gross",
                "deductions",
                "net",
                "currency",
                "status",
                "paid_on",
                "payment_ref",
                "bank_name",
                "account_number",
                "account_name",
            ],
            ...entries.map((e) => [
                e.period,
                e.team_members?.full_name ?? "",
                e.team_members?.email ?? "",
                e.team_members?.department ?? "",
                String(e.gross_amount),
                String(e.deductions),
                String(e.net_amount),
                e.currency,
                e.status,
                e.paid_on ?? "",
                e.payment_ref ?? "",
                e.bank_name ?? "",
                e.account_number ?? "",
                e.account_name ?? "",
            ]),
        ];
        const csv = rows.map((r) => r.map((c) => `"${(c ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `team-payroll-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <FinanceShell
            title="Team Payroll"
            subtitle="Create, approve, and track payroll entries for every team member."
            actions={
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        className="h-11 px-4 rounded-xl relative"
                        onClick={() => setShowRequests(true)}
                    >
                        <Inbox className="w-4 h-4 mr-1.5" /> Bank Requests
                        {requests.length > 0 && (
                            <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                                {requests.length}
                            </span>
                        )}
                    </Button>
                    <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={exportCsv}>
                        <Download className="w-4 h-4 mr-1.5" /> CSV
                    </Button>
                    <Button
                        onClick={() => setShowCreate(true)}
                        className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30"
                    >
                        <Plus className="w-4 h-4 mr-1.5" /> New Payroll
                    </Button>
                </div>
            }
        >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
                <StatCard icon={Wallet} label="Entries" value={String(entries.length)} accent="from-blue-500 to-indigo-500" />
                <StatCard icon={Users} label="Team Members" value={String(members.length)} accent="from-indigo-500 to-purple-500" />
                <StatCard icon={Clock} label="Outstanding" value={fmtMoney(totals.outstanding)} accent="from-amber-500 to-orange-500" />
                <StatCard icon={Check} label="Paid" value={fmtMoney(totals.paid)} accent="from-emerald-500 to-teal-500" />
            </div>

            <div className={`${glassCard} p-6 mb-8`}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-[15px] font-semibold text-[#0D1B39]">Team bank details</h3>
                        <p className="text-[12.5px] text-gray-500">
                            Update an employee&apos;s bank info directly, or approve a pending change request.
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {members.map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => setEditMember(m)}
                            className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:bg-blue-50/40 transition"
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-9 h-9 rounded-xl bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center text-[12px] font-bold">
                                    {m.full_name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[13.5px] font-semibold text-[#0D1B39] truncate">{m.full_name}</div>
                                    <div className="text-[11.5px] text-gray-400 truncate">
                                        {m.role_title || "—"} · {m.department || "No dept."}
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                                <div>
                                    <p className="text-gray-400">Bank</p>
                                    <p className="font-medium text-[#0D1B39] truncate">{m.bank_name || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Account</p>
                                    <p className="font-medium text-[#0D1B39] font-mono">{m.account_number || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Name on account</p>
                                    <p className="font-medium text-[#0D1B39] truncate">{m.account_name || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Base salary</p>
                                    <p className="font-medium text-[#0D1B39]">
                                        {m.base_salary ? fmtMoney(m.base_salary, m.salary_currency ?? "NGN") : "—"}
                                    </p>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className={`${glassCard} p-4 mb-4 flex items-center gap-3`}>
                <Search className="w-5 h-5 text-gray-400 ml-2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by member, period, payment reference…"
                    className="flex-1 bg-transparent outline-none text-sm"
                />
            </div>

            <div className="mb-6 flex items-center gap-2 flex-wrap">
                {(["all", "pending", "approved", "paid", "cancelled"] as const).map((key) => {
                    const active = statusFilter === key;
                    const count = key === "all" ? entries.length : entries.filter((e) => e.status === key).length;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setStatusFilter(key)}
                            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold capitalize transition border ${
                                active
                                    ? "bg-[#0A4FE8] text-white border-transparent shadow-sm shadow-blue-200"
                                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                            }`}
                        >
                            {key.replace(/_/g, " ")}
                            <span
                                className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                                    active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                                }`}
                            >
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {loading ? (
                <div className={`${glassCard} p-10 text-center text-gray-500`}>Loading payroll…</div>
            ) : filtered.length === 0 ? (
                <div className={`${glassCard} p-14 text-center`}>
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 grid place-items-center mx-auto mb-4">
                        <Wallet className="w-7 h-7 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">No payroll entries yet</h3>
                    <p className="text-gray-500 mt-1">
                        Click <span className="font-semibold">New Payroll</span> to create your first entry.
                    </p>
                </div>
            ) : (
                <div className={`${glassCard} overflow-hidden`}>
                    <table className="w-full text-sm">
                        <thead className="bg-white/50">
                            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                                <th className="px-5 py-4">Member</th>
                                <th className="px-5 py-4">Period</th>
                                <th className="px-5 py-4">Net</th>
                                <th className="px-5 py-4">Bank</th>
                                <th className="px-5 py-4">Status</th>
                                <th className="px-5 py-4"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((e) => (
                                <tr key={e.id} className="border-t border-white/60 hover:bg-white/50 transition">
                                    <td className="px-5 py-4">
                                        <div className="font-medium text-[#0D1B39]">{e.team_members?.full_name ?? "—"}</div>
                                        <div className="text-[11px] text-gray-400">{e.team_members?.department ?? "—"}</div>
                                    </td>
                                    <td className="px-5 py-4 text-gray-700">
                                        <div className="font-mono text-[13px]">{e.period}</div>
                                        <div className="text-[11px] text-gray-400 capitalize">
                                            {(e.period_type ?? "monthly").replace("_", " ")}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="font-semibold text-[#0D1B39]">
                                            {fmtMoney(e.net_amount, e.currency)}
                                        </div>
                                        <div className="text-[11px] text-gray-400">
                                            Gross {fmtMoney(e.gross_amount, e.currency)}
                                            {Number(e.deductions || 0) > 0
                                                ? ` · − ${fmtMoney(e.deductions, e.currency)}`
                                                : ""}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-[12px] text-gray-600">
                                        <div className="truncate max-w-[200px]">{e.bank_name || "—"}</div>
                                        <div className="font-mono text-gray-400 truncate max-w-[200px]">
                                            {e.account_number ?? "—"}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span
                                            className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${
                                                STATUS_STYLES[e.status] ?? STATUS_STYLES.pending
                                            }`}
                                        >
                                            {e.status}
                                        </span>
                                        {e.paid_on && (
                                            <div className="text-[10.5px] text-gray-400 mt-1">
                                                {new Date(e.paid_on).toLocaleDateString()}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {e.status === "pending" && (
                                                <button
                                                    onClick={() => approve(e)}
                                                    className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100 transition"
                                                >
                                                    Approve
                                                </button>
                                            )}
                                            {e.status !== "paid" && e.status !== "cancelled" && (
                                                <button
                                                    onClick={() => markPaid(e)}
                                                    className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition"
                                                >
                                                    Mark Paid
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setEditEntry(e)}
                                                title="Edit"
                                                className="w-8 h-8 rounded-lg hover:bg-gray-100 grid place-items-center text-gray-500 hover:text-blue-600 transition"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => remove(e)}
                                                title="Delete"
                                                className="w-8 h-8 rounded-lg hover:bg-red-50 grid place-items-center text-gray-400 hover:text-red-600 transition"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showCreate && (
                <CreatePayrollModal
                    members={members}
                    onClose={() => setShowCreate(false)}
                    onDone={() => {
                        setShowCreate(false);
                        load();
                    }}
                />
            )}
            {editEntry && (
                <EditPayrollModal
                    entry={editEntry}
                    onClose={() => setEditEntry(null)}
                    onDone={() => {
                        setEditEntry(null);
                        load();
                    }}
                />
            )}
            {editMember && (
                <EditBankModal
                    member={editMember}
                    onClose={() => setEditMember(null)}
                    onDone={() => {
                        setEditMember(null);
                        load();
                    }}
                />
            )}
            {showRequests && (
                <BankRequestsModal
                    requests={requests}
                    onClose={() => setShowRequests(false)}
                    onDone={() => load()}
                />
            )}
        </FinanceShell>
    );
}

/* ------------------------- modals ------------------------- */

function CreatePayrollModal({
    members,
    onClose,
    onDone,
}: {
    members: Member[];
    onClose: () => void;
    onDone: () => void;
}) {
    const [mode, setMode] = useState<"single" | "bulk">("single");
    const [memberId, setMemberId] = useState("");
    const [department, setDepartment] = useState<string>("");
    const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
    const [periodType, setPeriodType] = useState<PeriodType>("monthly");
    const [gross, setGross] = useState("");
    const [deductions, setDeductions] = useState("0");
    const [currency, setCurrency] = useState("NGN");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);

    const activeMembers = members.filter((m) => m.is_active);
    const departments = Array.from(
        new Set(activeMembers.map((m) => m.department).filter(Boolean)),
    ) as string[];

    useEffect(() => {
        if (mode === "single") {
            const m = activeMembers.find((x) => x.id === memberId);
            if (m?.base_salary) setGross(String(m.base_salary));
            if (m?.salary_currency) setCurrency(m.salary_currency);
            if (m?.pay_cycle) setPeriodType((m.pay_cycle as PeriodType) || "monthly");
        }
    }, [memberId, mode, activeMembers]);

    const submit = async () => {
        setSaving(true);
        try {
            if (mode === "single") {
                if (!memberId) return appAlert("Pick a team member.");
                if (!gross) return appAlert("Gross amount is required.");
                const r = await fetch("/api/admin/team-payroll", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        team_member_id: memberId,
                        period,
                        period_type: periodType,
                        gross_amount: Number(gross),
                        deductions: Number(deductions || 0),
                        currency,
                        notes: notes || null,
                    }),
                });
                const d = await r.json();
                if (!r.ok) return appAlert(d.error || "Failed to create payroll.");
            } else {
                const r = await fetch("/api/admin/team-payroll", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        bulk: true,
                        department: department || null,
                        defaults: {
                            period,
                            period_type: periodType,
                            gross_amount: gross ? Number(gross) : undefined,
                            deductions: Number(deductions || 0),
                            currency,
                            notes: notes || null,
                        },
                    }),
                });
                const d = await r.json();
                if (!r.ok) return appAlert(d.error || "Bulk create failed.");
            }
            onDone();
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell title="New payroll entry" onClose={onClose}>
            <div className="flex gap-2 mb-4">
                <button
                    type="button"
                    onClick={() => setMode("single")}
                    className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold ${
                        mode === "single" ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-600"
                    }`}
                >
                    Single entry
                </button>
                <button
                    type="button"
                    onClick={() => setMode("bulk")}
                    className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold ${
                        mode === "bulk" ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-600"
                    }`}
                >
                    Bulk (whole department)
                </button>
            </div>

            {mode === "single" ? (
                <Field label="Team member">
                    <Select value={memberId} onValueChange={setMemberId}>
                        <SelectTrigger className="h-11 rounded-xl">
                            <SelectValue placeholder="Select a team member" />
                        </SelectTrigger>
                        <SelectContent>
                            {activeMembers.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                    {m.full_name} — {m.department || "No dept."}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            ) : (
                <Field label="Department (leave blank for all active members)">
                    <Select value={department} onValueChange={setDepartment}>
                        <SelectTrigger className="h-11 rounded-xl">
                            <SelectValue placeholder="All departments" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">All departments</SelectItem>
                            {departments.map((d) => (
                                <SelectItem key={d} value={d}>{d}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}

            <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="Period">
                    <Input
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        placeholder="2026-04 or 2026-W17"
                        className="h-11 rounded-xl"
                    />
                </Field>
                <Field label="Period type">
                    <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="bi_weekly">Bi-weekly</SelectItem>
                            <SelectItem value="one_off">One-off</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
                <Field label="Gross amount">
                    <Input type="number" value={gross} onChange={(e) => setGross(e.target.value)} className="h-11 rounded-xl" />
                </Field>
                <Field label="Deductions">
                    <Input type="number" value={deductions} onChange={(e) => setDeductions(e.target.value)} className="h-11 rounded-xl" />
                </Field>
                <Field label="Currency">
                    <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="NGN">NGN</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="RWF">RWF</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
            </div>
            <Field label="Notes" className="mt-3">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-xl min-h-[70px]" />
            </Field>

            <div className="flex justify-end gap-2 mt-5">
                <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button onClick={submit} disabled={saving} className="bg-[#0A4FE8] hover:bg-[#083EC0]">
                    {saving ? "Saving…" : mode === "bulk" ? "Create for department" : "Create entry"}
                </Button>
            </div>
        </ModalShell>
    );
}

function EditPayrollModal({
    entry,
    onClose,
    onDone,
}: {
    entry: Entry;
    onClose: () => void;
    onDone: () => void;
}) {
    const [period, setPeriod] = useState(entry.period);
    const [gross, setGross] = useState(String(entry.gross_amount));
    const [deductions, setDeductions] = useState(String(entry.deductions));
    const [status, setStatus] = useState<EntryStatus>(entry.status);
    const [paidOn, setPaidOn] = useState(entry.paid_on ?? "");
    const [scheduledFor, setScheduledFor] = useState(entry.scheduled_for ?? "");
    const [paymentRef, setPaymentRef] = useState(entry.payment_ref ?? "");
    const [notes, setNotes] = useState(entry.notes ?? "");
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            const r = await fetch(`/api/admin/team-payroll/${entry.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    period,
                    gross_amount: Number(gross || 0),
                    deductions: Number(deductions || 0),
                    status,
                    paid_on: paidOn || null,
                    scheduled_for: scheduledFor || null,
                    payment_ref: paymentRef || null,
                    notes: notes || null,
                }),
            });
            const d = await r.json();
            if (!r.ok) return appAlert(d.error || "Couldn't update.");
            onDone();
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell title={`Edit payroll — ${entry.team_members?.full_name ?? ""}`} onClose={onClose}>
            <div className="grid grid-cols-2 gap-3">
                <Field label="Period"><Input value={period} onChange={(e) => setPeriod(e.target.value)} className="h-11 rounded-xl" /></Field>
                <Field label="Status">
                    <Select value={status} onValueChange={(v) => setStatus(v as EntryStatus)}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
                <Field label="Gross"><Input type="number" value={gross} onChange={(e) => setGross(e.target.value)} className="h-11 rounded-xl" /></Field>
                <Field label="Deductions"><Input type="number" value={deductions} onChange={(e) => setDeductions(e.target.value)} className="h-11 rounded-xl" /></Field>
                <Field label="Paid on"><Input type="date" value={paidOn ?? ""} onChange={(e) => setPaidOn(e.target.value)} className="h-11 rounded-xl" /></Field>
                <Field label="Scheduled for"><Input type="date" value={scheduledFor ?? ""} onChange={(e) => setScheduledFor(e.target.value)} className="h-11 rounded-xl" /></Field>
                <Field label="Payment ref" className="col-span-2"><Input value={paymentRef ?? ""} onChange={(e) => setPaymentRef(e.target.value)} className="h-11 rounded-xl" /></Field>
                <Field label="Notes" className="col-span-2"><Textarea value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} className="rounded-xl min-h-[70px]" /></Field>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 mt-4 text-[12px] text-gray-600">
                <div className="flex items-center gap-2 mb-1.5 text-gray-500">
                    <Banknote className="w-3.5 h-3.5" /> Bank snapshot on this entry
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-gray-400">Bank:</span> {entry.bank_name || "—"}</div>
                    <div><span className="text-gray-400">Account:</span> <span className="font-mono">{entry.account_number ?? "—"}</span></div>
                    <div className="col-span-2"><span className="text-gray-400">Name on account:</span> {entry.account_name || "—"}</div>
                </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
                <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button onClick={save} disabled={saving} className="bg-[#0A4FE8] hover:bg-[#083EC0]">
                    {saving ? "Saving…" : "Save changes"}
                </Button>
            </div>
        </ModalShell>
    );
}

function EditBankModal({
    member,
    onClose,
    onDone,
}: {
    member: Member;
    onClose: () => void;
    onDone: () => void;
}) {
    const [bankName, setBankName] = useState(member.bank_name ?? "");
    const [bankCode, setBankCode] = useState(member.bank_code ?? "");
    const [accountNumber, setAccountNumber] = useState(member.account_number ?? "");
    const [accountName, setAccountName] = useState(member.account_name ?? "");
    const [baseSalary, setBaseSalary] = useState(member.base_salary != null ? String(member.base_salary) : "");
    const [currency, setCurrency] = useState(member.salary_currency ?? "NGN");
    const [payCycle, setPayCycle] = useState(member.pay_cycle ?? "monthly");
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            const r = await fetch(`/api/admin/team-members/${member.id}/bank`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bank_name: bankName || null,
                    bank_code: bankCode || null,
                    account_number: accountNumber || null,
                    account_name: accountName || null,
                    base_salary: baseSalary ? Number(baseSalary) : null,
                    salary_currency: currency,
                    pay_cycle: payCycle,
                }),
            });
            const d = await r.json();
            if (!r.ok) return appAlert(d.error || "Couldn't update bank details.");
            onDone();
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell title={`Bank details — ${member.full_name}`} onClose={onClose}>
            <div className="grid grid-cols-2 gap-3">
                <Field label="Bank name" className="col-span-2">
                    <Input value={bankName} onChange={(e) => setBankName(e.target.value)} className="h-11 rounded-xl" />
                </Field>
                <Field label="Bank code">
                    <Input value={bankCode} onChange={(e) => setBankCode(e.target.value)} className="h-11 rounded-xl" placeholder="e.g. 057" />
                </Field>
                <Field label="Account number">
                    <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="h-11 rounded-xl font-mono" />
                </Field>
                <Field label="Name on account" className="col-span-2">
                    <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} className="h-11 rounded-xl" />
                </Field>
                <Field label="Base salary">
                    <Input type="number" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="h-11 rounded-xl" />
                </Field>
                <Field label="Currency">
                    <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="NGN">NGN</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="RWF">RWF</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
                <Field label="Pay cycle" className="col-span-2">
                    <Select value={payCycle} onValueChange={setPayCycle}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="bi_weekly">Bi-weekly</SelectItem>
                            <SelectItem value="one_off">One-off</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
            </div>
            <div className="flex justify-end gap-2 mt-5">
                <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button onClick={save} disabled={saving} className="bg-[#0A4FE8] hover:bg-[#083EC0]">
                    {saving ? "Saving…" : "Save bank details"}
                </Button>
            </div>
        </ModalShell>
    );
}

function BankRequestsModal({
    requests,
    onClose,
    onDone,
}: {
    requests: BankRequest[];
    onClose: () => void;
    onDone: () => void;
}) {
    const [working, setWorking] = useState<string | null>(null);

    const decide = async (r: BankRequest, action: "approve" | "reject") => {
        const note = action === "reject" ? window.prompt("Why are you rejecting this? (optional)") ?? "" : "";
        setWorking(r.id);
        try {
            const res = await fetch(`/api/admin/team-payroll/bank-requests/${r.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, admin_note: note || null }),
            });
            const d = await res.json();
            if (!res.ok) return appAlert(d.error || "Couldn't update request.");
            onDone();
        } finally {
            setWorking(null);
        }
    };

    return (
        <ModalShell title="Bank change requests" onClose={onClose} width="max-w-2xl">
            {requests.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">No pending requests.</div>
            ) : (
                <div className="space-y-3">
                    {requests.map((r) => (
                        <div key={r.id} className="rounded-xl border border-gray-200 p-4 bg-white">
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-[#0D1B39] truncate">
                                        {r.team_members?.full_name ?? "Unknown member"}
                                    </div>
                                    <div className="text-[12px] text-gray-400">
                                        {r.team_members?.department ?? "—"} · {new Date(r.created_at).toLocaleString()}
                                    </div>
                                </div>
                                <span className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                                    {r.status}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-[12.5px]">
                                <div>
                                    <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">Current</p>
                                    <p className="font-medium">{r.team_members?.bank_name ?? "—"}</p>
                                    <p className="font-mono text-gray-600">{r.team_members?.account_number ?? "—"}</p>
                                    <p className="text-gray-500">{r.team_members?.account_name ?? "—"}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">Proposed</p>
                                    <p className="font-medium">{r.bank_name ?? "—"}</p>
                                    <p className="font-mono text-gray-600">{r.account_number ?? "—"}</p>
                                    <p className="text-gray-500">{r.account_name ?? "—"}</p>
                                </div>
                            </div>
                            {r.reason && (
                                <p className="mt-3 text-[12px] text-gray-600 italic bg-gray-50 p-2 rounded-lg">
                                    “{r.reason}”
                                </p>
                            )}
                            <div className="flex justify-end gap-2 mt-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg"
                                    disabled={working === r.id}
                                    onClick={() => decide(r, "reject")}
                                >
                                    Reject
                                </Button>
                                <Button
                                    size="sm"
                                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700"
                                    disabled={working === r.id}
                                    onClick={() => decide(r, "approve")}
                                >
                                    <Check className="w-3.5 h-3.5 mr-1" /> Approve & apply
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </ModalShell>
    );
}

function ModalShell({
    title,
    onClose,
    children,
    width = "max-w-xl",
}: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    width?: string;
}) {
    return (
        <div
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className={`bg-white rounded-3xl shadow-2xl w-full ${width} max-h-[90vh] overflow-y-auto`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-[#0D1B39]">{title}</h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}

function Field({
    label,
    className = "",
    children,
}: {
    label: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={className}>
            <Label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">{label}</Label>
            <div className="mt-1.5">{children}</div>
        </div>
    );
}
