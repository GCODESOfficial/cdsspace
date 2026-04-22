"use client";

/* eslint-disable @next/next/no-img-element */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import {
  PenLine, Plus, Loader2, Check, X as XIcon, Search, Copy, MessageCircle,
  Send as SendIcon, Mail, Link2, Clock, Download, Archive, ArchiveRestore, Trash2,
} from "lucide-react";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

interface CDoc { id: string; title: string; share_token: string; theme: "light" | "dark" }
interface Member { id: string; full_name: string; email: string; avatar_url: string | null }
interface SignReq {
  id: string;
  document_id: string;
  status: "pending" | "opened" | "signed" | "declined" | "cancelled";
  access_token: string;
  signer_id: string | null;
  signer_email: string | null;
  signed_png_url: string | null;
  signed_at: string | null;
  requested_by: string | null;
  requested_by_admin: boolean;
  archived_at: string | null;
  created_at: string;
  team_cdocs: CDoc | null;
  _role: "sent" | "to_sign" | "other";
}

export default function CSignPage() {
  return (
    <Suspense fallback={null}><Inner /></Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const preDoc = params?.get("doc");
  const preSigner = params?.get("signer");

  const [requests, setRequests] = useState<SignReq[]>([]);
  const [tab, setTab] = useState<"all" | "sent" | "to_sign">("all");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState<boolean>(Boolean(preDoc));
  const [success, setSuccess] = useState<SignReq[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function fetchRequests() {
    setLoading(true);
    const r = await fetch("/api/csign", { cache: "no-store" });
    const j = await r.json();
    if (j.ok) setRequests(j.requests);
    setLoading(false);
  }
  useEffect(() => { fetchRequests(); }, []);

  const filtered = requests.filter((r) => {
    if (r.archived_at) return false;
    if (tab === "sent") return r._role === "sent";
    if (tab === "to_sign") return r._role === "to_sign";
    return true;
  });

  async function bulk(action: "archive" | "unarchive" | "delete") {
    if (selected.size === 0) return;
    if (action === "delete" && !(await appConfirm("Delete selected? Signed requests are preserved."))) return;
    if (action === "delete") {
      await fetch("/api/csign", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
    } else {
      await fetch("/api/csign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      });
    }
    setSelected(new Set());
    fetchRequests();
  }

  return (
    <div className="p-6 md:p-8 max-w-[1200px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[26px] font-bold text-[#0D1B39] tracking-tight">cSign</h1>
          <p className="text-gray-400 text-[13px] mt-1">Send a cDocs document for signature. Signers open a link or scan a QR to sign on mobile.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-[13px] font-medium rounded-xl hover:bg-[#083EC0]">
          <Plus className="w-4 h-4" /> New request
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 text-[13px]">
        {(["all", "sent", "to_sign"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg font-medium capitalize transition ${
              tab === t ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
            }`}
          >
            {t === "to_sign" ? "To sign" : t === "sent" ? "Sent by me" : "All"}
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="mb-4 rounded-xl bg-[#0A4FE8]/5 border border-[#0A4FE8]/20 px-4 py-2.5 flex items-center gap-3 text-[12.5px]">
          <span className="font-semibold text-[#0A4FE8]">{selected.size} selected</span>
          <button onClick={() => bulk("archive")} className="inline-flex items-center gap-1.5 text-gray-600 hover:text-[#0A4FE8]"><Archive className="w-3.5 h-3.5" /> Archive</button>
          <button onClick={() => bulk("unarchive")} className="inline-flex items-center gap-1.5 text-gray-600 hover:text-[#0A4FE8]"><ArchiveRestore className="w-3.5 h-3.5" /> Restore</button>
          <button onClick={() => bulk("delete")} className="inline-flex items-center gap-1.5 text-rose-600 hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /> Delete (not signed)</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-gray-400 hover:text-gray-600">Clear</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-14 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center text-[13px] text-gray-400">Nothing here yet.</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map((r) => (
              <li key={r.id} className="px-5 py-3.5 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => {
                    const next = new Set(selected);
                    if (next.has(r.id)) next.delete(r.id);
                    else next.add(r.id);
                    setSelected(next);
                  }}
                  className="w-4 h-4"
                />
                <div className="w-9 h-9 rounded-lg bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center shrink-0">
                  <PenLine className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-[#0D1B39] truncate">{r.team_cdocs?.title || "Document"}</p>
                  <p className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {new Date(r.created_at).toLocaleString()}
                    {r.signer_email && <>· to {r.signer_email}</>}
                  </p>
                </div>
                <StatusBadge status={r.status} />
                <a
                  href={`${typeof window !== "undefined" ? window.location.origin : ""}/sign/${r.access_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-lg text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50"
                  title="Open signing link"
                >
                  <Link2 className="w-4 h-4" />
                </a>
                {r.status === "signed" && r.team_cdocs && (
                  <button
                    onClick={() => downloadSigned(r)}
                    className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"
                    title="Download signed PDF"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreate && (
        <CreateModal
          initialDocId={preDoc || null}
          initialSignerId={preSigner || null}
          onClose={() => { setShowCreate(false); if (preDoc) router.replace("/team/csign"); }}
          onCreated={(created) => {
            setShowCreate(false);
            setSuccess(created);
            fetchRequests();
            if (preDoc) router.replace("/team/csign");
          }}
        />
      )}
      {success && <SuccessModal requests={success} onClose={() => setSuccess(null)} />}
    </div>
  );
}

function StatusBadge({ status }: { status: SignReq["status"] }) {
  const map = {
    pending: "bg-amber-100 text-amber-700",
    opened: "bg-blue-100 text-blue-700",
    signed: "bg-emerald-100 text-emerald-700",
    declined: "bg-rose-100 text-rose-700",
    cancelled: "bg-gray-100 text-gray-500",
  } as const;
  return (
    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${map[status]}`}>{status}</span>
  );
}

function CreateModal({ initialDocId, initialSignerId, onClose, onCreated }: {
  initialDocId: string | null;
  initialSignerId: string | null;
  onClose: () => void;
  onCreated: (created: SignReq[]) => void;
}) {
  const [docs, setDocs] = useState<CDoc[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [docId, setDocId] = useState<string>(initialDocId || "");
  const [signerIds, setSignerIds] = useState<Set<string>>(new Set(initialSignerId ? [initialSignerId] : []));
  const [signerEmail, setSignerEmail] = useState("");
  const [includeOwner, setIncludeOwner] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [a, b] = await Promise.all([
        fetch("/api/cdocs", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/admin/team-members", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (a.ok) setDocs(a.docs.filter((d: any) => !d.archived));
      if (b.ok) setMembers(b.members);
    })();
  }, []);

  const filteredMembers = members.filter((m) =>
    [m.full_name, m.email].some((v) => (v || "").toLowerCase().includes(search.toLowerCase()))
  );

  async function submit() {
    if (!docId) { appAlert("Pick a document"); return; }
    if (signerIds.size === 0 && !signerEmail && !includeOwner) { appAlert("Pick at least one signer"); return; }
    setSaving(true);
    const r = await fetch("/api/csign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_id: docId,
        signer_ids: Array.from(signerIds),
        signer_email: signerEmail || undefined,
        include_owner: includeOwner,
      }),
    });
    const j = await r.json();
    setSaving(false);
    if (!r.ok || !j.ok) { appAlert(j.error || "Couldn't create"); return; }
    const docMap = docs.find((d) => d.id === docId);
    const enriched: SignReq[] = (j.requests || []).map((row: any) => ({ ...row, team_cdocs: docMap || null, _role: "sent" }));
    onCreated(enriched);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-[#0D1B39]">Send for signature</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Each signer gets their own secure link.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50"><XIcon className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Document</label>
            <select value={docId} onChange={(e) => setDocId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]">
              <option value="">Pick a document…</option>
              {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Signers (team)</label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[12.5px]" />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100">
              {filteredMembers.map((m) => {
                const checked = signerIds.has(m.id);
                return (
                  <label key={m.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = new Set(signerIds);
                        if (checked) next.delete(m.id);
                        else next.add(m.id);
                        setSignerIds(next);
                      }}
                      className="w-4 h-4"
                    />
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center text-[10px] font-bold">{m.full_name.charAt(0)}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-[#0D1B39] truncate">{m.full_name}</p>
                      <p className="text-[10.5px] text-gray-400 truncate">{m.email}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Or send to an external email</label>
            <input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="client@company.com" className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]" />
          </div>
          <label className="inline-flex items-center gap-2 text-[12.5px] text-[#0D1B39] cursor-pointer">
            <input type="checkbox" checked={includeOwner} onChange={(e) => setIncludeOwner(e.target.checked)} className="w-4 h-4" />
            Include me (admin) as a signer
          </label>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-2">
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#0A4FE8] text-white text-[13px] font-medium hover:bg-[#083EC0] disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Send request
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function SuccessModal({ requests, onClose }: { requests: SignReq[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-[#0D1B39]">Request sent</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Share each link with the intended signer.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50"><XIcon className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {requests.map((r) => <SignerCard key={r.id} req={r} />)}
        </div>
      </div>
    </div>
  );
}

function SignerCard({ req }: { req: SignReq }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/sign/${req.access_token}` : `/sign/${req.access_token}`;

  useEffect(() => { QRCode.toDataURL(url, { width: 180 }).then(setQr); }, [url]);

  const shareText = `Please sign this document${req.team_cdocs ? ` — "${req.team_cdocs.title}"` : ""}: ${url}`;

  function open(href: string) { window.open(href, "_blank", "noopener,noreferrer"); }
  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-xl border border-gray-100 p-4 flex gap-4">
      {qr && <img src={qr} alt="QR" className="w-28 h-28 rounded-lg bg-white border border-gray-100 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-semibold text-[#0D1B39] truncate">
          {req.signer_email || "Team signer"}
        </p>
        <p className="text-[10.5px] text-gray-400 break-all mt-0.5">{url}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button onClick={copy} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0A4FE8] text-white text-[11px] font-medium">
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={() => open(`https://wa.me/?text=${encodeURIComponent(shareText)}`)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#25D366]/40 text-[#128C7E] text-[11px]">
            <MessageCircle className="w-3 h-3" /> WhatsApp
          </button>
          <button onClick={() => open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#229ED9]/40 text-[#229ED9] text-[11px]">
            <SendIcon className="w-3 h-3" /> Telegram
          </button>
          <button onClick={() => open(`mailto:${req.signer_email || ""}?subject=Please%20sign&body=${encodeURIComponent(shareText)}`)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-[11px]">
            <Mail className="w-3 h-3" /> Email
          </button>
        </div>
      </div>
    </div>
  );
}

function downloadSigned(r: SignReq) {
  if (!r.team_cdocs || !r.signed_png_url) return;
  import("@/lib/cdocs-pdf").then(({ exportCDocToPdf }) => {
    fetch(`/api/cdocs/public/${r.team_cdocs!.share_token}`)
      .then((res) => res.json())
      .then((j) => {
        if (j.ok) {
          exportCDocToPdf({
            title: j.doc.title,
            body: j.doc.body,
            theme: j.doc.theme,
            stamped: true,
            signature: { dataUrl: r.signed_png_url!, signedAt: r.signed_at || undefined },
          });
        }
      });
  });
}
