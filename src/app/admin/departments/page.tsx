"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Plus,
  Hash,
  Trash2,
  Users as UsersIcon,
  MessageSquare,
  Check,
  X,
  Search,
  UserMinus,
  ArrowRight,
} from "lucide-react";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";
import { AIAssistButton } from "@/components/ai/AIAssistButton";

interface Department {
  id: string;
  name: string;
  description: string | null;
  thread_id: string | null;
  created_at: string;
  member_count: number;
}

interface Member {
  id: string;
  full_name: string;
  email: string;
  username: string;
  role_title: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Department | null>(null);
  const [search, setSearch] = useState("");

  async function fetchDepartments() {
    setLoading(true);
    const r = await fetch("/api/admin/departments", { cache: "no-store" });
    const j = await r.json();
    if (j.ok) setDepartments(j.departments || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchDepartments();
  }, []);

  async function removeDepartment(d: Department) {
    if (!(await appConfirm(`Remove "${d.name}"? The chat thread and all its messages will be deleted.`))) return;
    await fetch("/api/admin/departments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id }),
    });
    if (selected?.id === d.id) setSelected(null);
    fetchDepartments();
  }

  const filtered = departments.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">HRM</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Departments</h1>
          <p className="text-gray-400 text-[13px] mt-1">
            Create departments. Each one gets a dedicated team chat channel automatically.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition"
        >
          <Plus className="w-4 h-4" /> New department
        </button>
      </div>

      {showCreate && (
        <CreateDepartmentForm
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchDepartments();
          }}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        {/* List */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Hash className="w-4 h-4 text-gray-400" />
            <h2 className="text-[14px] font-semibold text-[#0D1B39] flex-1">
              All departments <span className="text-gray-400 font-normal">({departments.length})</span>
            </h2>
          </div>
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
          {loading ? (
            <div className="py-14 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-14 text-center text-[12.5px] text-gray-400">
              {departments.length === 0 ? "No departments yet. Create your first." : "No matches."}
            </p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {filtered.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => setSelected(d)}
                    className={`w-full text-left px-5 py-3.5 hover:bg-gray-50 transition flex items-start gap-3 ${
                      selected?.id === d.id ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center">
                      <Hash className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold text-[#0D1B39] truncate">{d.name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {d.member_count} {d.member_count === 1 ? "member" : "members"}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 mt-2.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[500px]">
          {selected ? (
            <DepartmentDetail
              key={selected.id}
              department={selected}
              onChanged={fetchDepartments}
              onDelete={() => removeDepartment(selected)}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-10">
              <div className="w-14 h-14 rounded-xl bg-gray-50 flex items-center justify-center mb-3">
                <UsersIcon className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-[14px] font-semibold text-[#0D1B39]">Pick a department</p>
              <p className="text-[12.5px] text-gray-400 mt-1 max-w-xs">
                Select one from the list to manage its members and open its chat channel.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateDepartmentForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await fetch("/api/admin/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const j = await r.json();
    setSaving(false);
    if (!r.ok || !j.ok) {
      setError(j.error || "Couldn't create department");
      return;
    }
    onCreated();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[15px] font-semibold text-[#0D1B39]">New department</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Design, Engineering, Growth"
            className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="relative">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Description</label>
          <div className="absolute top-0 right-0">
            <AIAssistButton
              kind="department_description"
              input={{ name, notes: description }}
              onAccept={setDescription}
            />
          </div>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this department responsible for? (optional)"
            className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12px] px-4 py-2.5">{error}</div>
        )}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-[13px] font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Create
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <p className="text-[11px] text-gray-400 ml-auto">A chat channel will be created automatically.</p>
        </div>
      </form>
    </div>
  );
}

function DepartmentDetail({
  department,
  onChanged,
  onDelete,
}: {
  department: Department;
  onChanged: () => void;
  onDelete: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [available, setAvailable] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [a, b] = await Promise.all([
      fetch(`/api/admin/departments/${department.id}/members`, { cache: "no-store" }),
      fetch("/api/admin/team-members", { cache: "no-store" }),
    ]);
    const ja = await a.json();
    const jb = await b.json();
    const dept = (ja.members || []) as Member[];
    setMembers(dept);
    const deptIds = new Set(dept.map((m) => m.id));
    setAvailable(((jb.members || []) as Member[]).filter((m) => m.is_active && !deptIds.has(m.id)));
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department.id]);

  async function addMember(id: string) {
    setAdding(id);
    try {
      await fetch(`/api/admin/departments/${department.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_ids: [id] }),
      });
      await refresh();
      onChanged();
    } finally {
      setAdding(null);
    }
  }

  async function removeMember(id: string) {
    await fetch(`/api/admin/departments/${department.id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_ids: [id] }),
    });
    await refresh();
    onChanged();
  }

  const pickerFiltered = available.filter((m) =>
    [m.full_name, m.email, m.username].some((v) => (v || "").toLowerCase().includes(pickerQuery.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-gray-100 flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center">
          <Hash className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[17px] font-bold text-[#0D1B39]">{department.name}</h2>
          {department.description && <p className="text-[12.5px] text-gray-500 mt-0.5">{department.description}</p>}
          <p className="text-[11.5px] text-gray-400 mt-1">
            {members.length} {members.length === 1 ? "member" : "members"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {department.thread_id && (
            <Link
              href={`/admin/chat?thread=${department.thread_id}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#0A4FE8]/30 text-[#0A4FE8] text-[12px] font-medium hover:bg-blue-50 transition"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Open chat
            </Link>
          )}
          <button
            onClick={onDelete}
            className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
            title="Delete department"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold text-[#0D1B39]">Members</h3>
            <button
              onClick={() => setAddPickerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A4FE8] text-white text-[12px] font-medium hover:bg-[#083EC0] transition"
            >
              <Plus className="w-3.5 h-3.5" /> Add members
            </button>
          </div>

          {addPickerOpen && (
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/50 p-3">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Search team members…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-gray-200 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {pickerFiltered.length === 0 ? (
                  <p className="py-4 text-center text-[12px] text-gray-400">No more members to add.</p>
                ) : (
                  <ul className="space-y-1">
                    {pickerFiltered.map((m) => (
                      <li key={m.id}>
                        <button
                          onClick={() => addMember(m.id)}
                          disabled={adding === m.id}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white transition flex items-center gap-2.5 disabled:opacity-50"
                        >
                          <MemberAvatar m={m} size={28} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] font-semibold text-[#0D1B39] truncate">{m.full_name}</p>
                            <p className="text-[10.5px] text-gray-500">@{m.username}</p>
                          </div>
                          {adding === m.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0A4FE8]" />
                          ) : (
                            <Plus className="w-3.5 h-3.5 text-[#0A4FE8]" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-[#0A4FE8]" />
            </div>
          ) : members.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[13px] text-gray-500">No members yet.</p>
              <p className="text-[11.5px] text-gray-400 mt-0.5">Add someone above to populate the chat channel.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {members.map((m) => (
                <li key={m.id} className="py-3 flex items-center gap-3">
                  <MemberAvatar m={m} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#0D1B39] truncate">{m.full_name}</p>
                    <p className="text-[11.5px] text-gray-500 truncate">
                      @{m.username}
                      {m.role_title ? ` · ${m.role_title}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => removeMember(m.id)}
                    className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
                    title="Remove from department"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function MemberAvatar({ m, size = 32 }: { m: Member; size?: number }) {
  if (m.avatar_url) {
    return (
      <img
        src={m.avatar_url}
        alt={m.full_name}
        className="rounded-full object-cover border border-gray-200 shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-[#0A4FE8] text-white font-bold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(10, size / 3) }}
    >
      {m.full_name.charAt(0).toUpperCase()}
    </div>
  );
}
