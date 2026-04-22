"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PenLine,
  Plus,
  Loader2,
  X,
  Clock,
  Check,
  Copy,
  ExternalLink,
} from "lucide-react";

interface Request {
  id: string;
  signer_team_member_id: string | null;
  signer_email: string | null;
  signer_name: string | null;
  access_token: string;
  signed_at: string | null;
  status: "pending" | "signed" | "cancelled" | "expired";
  created_at: string;
  requested_by: string | null;
  requested_by_admin: boolean;
}

interface Member {
  id: string;
  full_name: string;
  username: string;
}

export default function AdminCsignPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    const [req, mem] = await Promise.all([
      fetch("/api/team/signatures").then((r) => r.json()),
      fetch("/api/admin/members-list").then((r) => r.json()),
    ]);
    if (req.ok) setRequests(req.requests);
    if (mem.ok) setMembers(mem.members);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const nameForId = (id: string | null) =>
    id ? members.find((m) => m.id === id)?.full_name || "—" : "";

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Workspace</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">cSign</h1>
          <p className="text-gray-400 text-[13px] mt-1">All signature requests across the company.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition"
        >
          <Plus className="w-4 h-4" />
          New request
        </button>
      </div>

      {showForm && (
        <NewRequestForm
          members={members}
          onClose={() => setShowForm(false)}
          onCreated={(token) => {
            setShowForm(false);
            refresh();
            navigator.clipboard.writeText(`${window.location.origin}/csign/${token}`);
          }}
        />
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-[#0D1B39]">
            All requests <span className="text-gray-400 font-normal">({requests.length})</span>
          </h2>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <p className="py-12 text-center text-gray-400 text-sm">No signature requests yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {requests.map((r) => (
              <Row key={r.id} r={r} signerName={nameForId(r.signer_team_member_id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ r, signerName }: { r: Request; signerName: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/csign/${r.access_token}` : "";

  const meta: Record<Request["status"], { label: string; color: string }> = {
    pending: { label: "Pending", color: "bg-amber-50 text-amber-700 border-amber-200" },
    signed: { label: "Signed", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    cancelled: { label: "Cancelled", color: "bg-rose-50 text-rose-700 border-rose-200" },
    expired: { label: "Expired", color: "bg-gray-100 text-gray-600 border-gray-200" },
  };
  const m = meta[r.status];

  return (
    <div className="px-6 py-4 flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0A4FE8] flex items-center justify-center shrink-0">
        <PenLine className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-semibold text-[#0D1B39]">
            {signerName || r.signer_name || r.signer_email || "—"}
          </p>
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${m.color}`}>
            {m.label}
          </span>
          {r.requested_by_admin && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              Admin
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-1 inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {r.status === "signed" && r.signed_at
            ? `Signed ${new Date(r.signed_at).toLocaleDateString()}`
            : `Created ${new Date(r.created_at).toLocaleDateString()}`}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="p-2 rounded-lg text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition"
          title="Copy signing link"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </button>
        <Link
          href={`/csign/${r.access_token}`}
          target="_blank"
          className="p-2 rounded-lg text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition"
        >
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

function NewRequestForm({
  members,
  onClose,
  onCreated,
}: {
  members: Member[];
  onClose: () => void;
  onCreated: (token: string) => void;
}) {
  const [mode, setMode] = useState<"internal" | "external">("internal");
  const [signerId, setSignerId] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerName, setSignerName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const body =
      mode === "internal"
        ? { signer_team_member_id: signerId }
        : { signer_email: signerEmail, signer_name: signerName };
    const res = await fetch("/api/team/signatures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok || !json.ok) {
      setError(json.error || "Failed");
      return;
    }
    onCreated(json.access_token);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-[#0D1B39]">New signature request</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="flex gap-2 mb-4 p-1 bg-gray-50 rounded-xl w-fit border border-gray-100">
        {(["internal", "external"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-xl text-[12px] font-semibold capitalize transition ${
              mode === m ? "bg-white text-[#0A4FE8] shadow-sm" : "text-gray-500"
            }`}
          >
            {m === "internal" ? "Team member" : "External email"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "internal" ? (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Team member *</label>
            <select
              value={signerId}
              onChange={(e) => setSignerId(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]"
            >
              <option value="">Select…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" value={signerName} onChange={setSignerName} />
            <Field label="Email *" value={signerEmail} onChange={setSignerEmail} type="email" required />
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12px] px-4 py-2.5">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-[13px] font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
            Create
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
        <p className="text-[11px] text-gray-400">Link will be copied to your clipboard.</p>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]"
      />
    </div>
  );
}
