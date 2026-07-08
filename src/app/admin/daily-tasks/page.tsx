"use client";

import { useCallback, useEffect, useState } from "react";
import {
    Loader2, ListChecks, Plus, Trash2, ArrowUp, ArrowDown, Save, RotateCcw,
    Users, Briefcase, Globe, GripVertical,
} from "lucide-react";
import { toast } from "sonner";

interface Item { kind: "task" | "evidence"; label: string }
interface RoleOpt { key: string; name: string }
interface MemberOpt { id: string; full_name: string; role_title: string | null; department: string | null }
type Scope = "universal" | "role" | "member";
interface Selection { scope: Scope; key: string | null; label: string; sub?: string }

export default function DailyTasksAdminPage() {
    const [roles, setRoles] = useState<RoleOpt[]>([]);
    const [members, setMembers] = useState<MemberOpt[]>([]);
    const [loadingMeta, setLoadingMeta] = useState(true);

    const [selection, setSelection] = useState<Selection>({ scope: "universal", key: null, label: "Universal (all roles)" });
    const [items, setItems] = useState<Item[]>([]);
    const [customized, setCustomized] = useState(false);
    const [loadingItems, setLoadingItems] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const r = await fetch("/api/admin/daily-tasks");
                const j = await r.json();
                if (!r.ok) throw new Error(j.error || "Failed to load");
                setRoles(j.roles || []);
                setMembers(j.members || []);
            } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
            finally { setLoadingMeta(false); }
        })();
    }, []);

    const loadItems = useCallback(async (sel: Selection) => {
        setLoadingItems(true);
        try {
            const params = new URLSearchParams({ scope: sel.scope });
            if (sel.key) params.set("key", sel.key);
            const r = await fetch(`/api/admin/daily-tasks?${params}`);
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Failed to load");
            setItems((j.items || []).map((it: any) => ({ kind: it.kind, label: it.label })));
            setCustomized(!!j.customized);
        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
        finally { setLoadingItems(false); }
    }, []);

    useEffect(() => { loadItems(selection); }, [selection, loadItems]);

    const select = (sel: Selection) => setSelection(sel);

    const updateItem = (i: number, patch: Partial<Item>) =>
        setItems((cur) => cur.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
    const removeItem = (i: number) => setItems((cur) => cur.filter((_, idx) => idx !== i));
    const move = (i: number, dir: -1 | 1) =>
        setItems((cur) => {
            const j = i + dir;
            if (j < 0 || j >= cur.length) return cur;
            const next = [...cur];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
    const addItem = (kind: "task" | "evidence") => setItems((cur) => [...cur, { kind, label: "" }]);

    const save = async () => {
        const clean = items.map((it) => ({ kind: it.kind, label: it.label.trim() })).filter((it) => it.label);
        setSaving(true);
        try {
            const r = await fetch("/api/admin/daily-tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "save", scope: selection.scope, key: selection.key, items: clean }),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Failed to save");
            setItems((j.items || []).map((it: any) => ({ kind: it.kind, label: it.label })));
            setCustomized(!!j.customized);
            toast.success("Daily tasks saved");
        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save"); }
        finally { setSaving(false); }
    };

    const reset = async () => {
        setSaving(true);
        try {
            const r = await fetch("/api/admin/daily-tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "reset", scope: selection.scope, key: selection.key }),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Failed to reset");
            setItems((j.items || []).map((it: any) => ({ kind: it.kind, label: it.label })));
            setCustomized(!!j.customized);
            toast.success("Reverted to default");
        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to reset"); }
        finally { setSaving(false); }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1400px]">
                <div className="mb-6 flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600"><ListChecks className="h-6 w-6" /></span>
                    <div>
                        <h1 className="text-[22px] font-bold text-gray-900">Daily Tasks</h1>
                        <p className="text-sm text-gray-500">Set the compulsory daily checklist for everyone, per role, or per team member.</p>
                    </div>
                </div>

                {loadingMeta ? (
                    <div className="flex justify-center py-24 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : (
                    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
                        {/* Scope picker */}
                        <aside className="space-y-4">
                            <PickerCard title="Universal" icon={<Globe className="h-4 w-4" />}>
                                <ScopeButton
                                    active={selection.scope === "universal"}
                                    label="All roles"
                                    sub="Applies to every team member"
                                    onClick={() => select({ scope: "universal", key: null, label: "Universal (all roles)" })}
                                />
                            </PickerCard>

                            <PickerCard title="Roles" icon={<Briefcase className="h-4 w-4" />}>
                                {roles.length === 0 ? <Empty /> : roles.map((r) => (
                                    <ScopeButton
                                        key={r.key}
                                        active={selection.scope === "role" && selection.key === r.key}
                                        label={r.name}
                                        onClick={() => select({ scope: "role", key: r.key, label: r.name })}
                                    />
                                ))}
                            </PickerCard>

                            <PickerCard title="Team members" icon={<Users className="h-4 w-4" />}>
                                {members.length === 0 ? <Empty /> : members.map((m) => (
                                    <ScopeButton
                                        key={m.id}
                                        active={selection.scope === "member" && selection.key === m.id}
                                        label={m.full_name}
                                        sub={[m.role_title, m.department].filter(Boolean).join(" · ") || undefined}
                                        onClick={() => select({ scope: "member", key: m.id, label: m.full_name, sub: m.role_title || undefined })}
                                    />
                                ))}
                            </PickerCard>
                        </aside>

                        {/* Editor */}
                        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
                                <div className="min-w-0">
                                    <h2 className="truncate text-[16px] font-bold text-gray-900">{selection.label}</h2>
                                    <p className="text-[12px] text-gray-500">
                                        {selection.scope === "member"
                                            ? "Extra daily tasks for this person (added on top of their role + universal)."
                                            : selection.scope === "role"
                                                ? "Daily tasks & evidence for everyone matched to this role."
                                                : "Compulsory daily tasks for every team member."}
                                    </p>
                                </div>
                                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${customized ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                                    {customized ? "Customized" : "Using defaults"}
                                </span>
                            </div>

                            {loadingItems ? (
                                <div className="flex justify-center py-16 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                            ) : (
                                <>
                                    <div className="space-y-2">
                                        {items.length === 0 && (
                                            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-[13px] text-gray-400">
                                                No daily tasks here yet. Add one below.
                                            </p>
                                        )}
                                        {items.map((it, i) => (
                                            <div key={i} className="flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-2.5">
                                                <GripVertical className="mt-2 h-4 w-4 shrink-0 text-gray-300" />
                                                <select
                                                    value={it.kind}
                                                    onChange={(e) => updateItem(i, { kind: e.target.value as Item["kind"] })}
                                                    className="mt-0.5 h-9 shrink-0 rounded-lg border border-gray-200 bg-white px-2 text-[12px] font-semibold text-gray-700 outline-none focus:border-blue-400"
                                                >
                                                    <option value="task">Task</option>
                                                    <option value="evidence">Evidence</option>
                                                </select>
                                                <textarea
                                                    value={it.label}
                                                    onChange={(e) => updateItem(i, { label: e.target.value })}
                                                    rows={1}
                                                    placeholder="Describe the daily task…"
                                                    className="min-h-9 flex-1 resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-800 outline-none focus:border-blue-400"
                                                />
                                                <div className="mt-0.5 flex shrink-0 flex-col gap-1 sm:flex-row">
                                                    <IconBtn onClick={() => move(i, -1)} disabled={i === 0} title="Move up"><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                                                    <IconBtn onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Move down"><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                                                    <IconBtn onClick={() => removeItem(i)} title="Remove" danger><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button onClick={() => addItem("task")} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-700 hover:border-blue-300 hover:text-blue-700">
                                            <Plus className="h-3.5 w-3.5" /> Add task
                                        </button>
                                        {selection.scope === "role" && (
                                            <button onClick={() => addItem("evidence")} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-700 hover:border-blue-300 hover:text-blue-700">
                                                <Plus className="h-3.5 w-3.5" /> Add evidence item
                                            </button>
                                        )}
                                    </div>

                                    <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
                                        {customized && (
                                            <button onClick={reset} disabled={saving} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60">
                                                <RotateCcw className="h-3.5 w-3.5" /> Revert to default
                                            </button>
                                        )}
                                        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-blue-600 to-blue-700 px-5 py-2 text-[13px] font-bold text-white shadow-sm hover:from-blue-700 hover:to-blue-800 disabled:opacity-60">
                                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                                        </button>
                                    </div>
                                </>
                            )}
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
}

function PickerCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center gap-2 px-1 text-[12px] font-bold uppercase tracking-wide text-gray-400">{icon}{title}</div>
            <div className="max-h-[280px] space-y-1 overflow-y-auto">{children}</div>
        </div>
    );
}

function ScopeButton({ active, label, sub, onClick }: { active: boolean; label: string; sub?: string; onClick: () => void }) {
    return (
        <button onClick={onClick} className={`w-full rounded-xl px-3 py-2 text-left transition ${active ? "bg-blue-600 text-white" : "hover:bg-gray-50 text-gray-700"}`}>
            <p className={`truncate text-[13px] font-semibold ${active ? "text-white" : "text-gray-800"}`}>{label}</p>
            {sub && <p className={`truncate text-[11px] ${active ? "text-blue-100" : "text-gray-400"}`}>{sub}</p>}
        </button>
    );
}

function IconBtn({ children, onClick, disabled, title, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string; danger?: boolean }) {
    return (
        <button onClick={onClick} disabled={disabled} title={title}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white transition disabled:opacity-30 ${danger ? "text-rose-500 hover:border-rose-300 hover:bg-rose-50" : "text-gray-500 hover:border-blue-300 hover:text-blue-600"}`}>
            {children}
        </button>
    );
}

function Empty() {
    return <p className="px-3 py-2 text-[12px] text-gray-400">None found.</p>;
}
