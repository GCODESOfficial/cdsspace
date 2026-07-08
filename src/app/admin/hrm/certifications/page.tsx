"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Award, Mail, Phone, Calendar, Trash2, Check, ExternalLink, X } from "lucide-react";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

interface CertRequest {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  intern_role: string;
  internship_start: string | null;
  internship_end: string | null;
  supervisor_name: string | null;
  notes: string | null;
  status: string;
  certificate_url: string | null;
  created_at: string;
}

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "issued", label: "Issued" },
  { key: "rejected", label: "Rejected" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600",
  approved: "bg-blue-50 text-[#0A4FE8]",
  issued: "bg-emerald-50 text-emerald-600",
  rejected: "bg-red-50 text-red-500",
};

export default function CertificationsPage() {
  const [requests, setRequests] = useState<CertRequest[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [filter, setFilter] = useState("all");
  const [viewItem, setViewItem] = useState<CertRequest | null>(null);
  const { toast } = useToast();

  useEffect(() => { fetchRequests(); }, []);

  async function fetchRequests() {
    setIsFetching(true);
    const { data } = await supabase.from("cert_requests").select("*").order("created_at", { ascending: false });
    setRequests(data || []);
    setIsFetching(false);
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from("cert_requests").update({ status }).eq("id", id);
    fetchRequests();
    toast({ title: "Updated", description: `Marked as ${status}` });
  }

  async function handleDelete(id: string) {
    if (!(await appConfirm("Delete this request?"))) return;
    await supabase.from("cert_requests").delete().eq("id", id);
    fetchRequests();
  }

  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);
  const counts = requests.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="p-8 max-w-[1100px]">
      <div className="mb-8">
        <p className="text-[#0A4FE8] text-sm font-semibold">HRM</p>
        <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Internship Certifications</h1>
        <p className="text-gray-400 text-[13px] mt-1">Manage certificate requests from past interns</p>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition ${
              filter === f.key ? "bg-[#0A4FE8] text-white" : "bg-white text-gray-500 border border-gray-200 hover:border-blue-200"
            }`}>
            {f.label} {f.key !== "all" && counts[f.key] ? `(${counts[f.key]})` : ""}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isFetching ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Award className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No certificate requests {filter !== "all" && `marked as "${filter}"`}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(r => (
              <div key={r.id} className="px-6 py-4 hover:bg-gray-50/50 transition">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 flex-shrink-0">
                    <Award className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold text-[#0D1B39]">{r.full_name}</p>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${STATUS_COLORS[r.status] || "bg-gray-100 text-gray-500"}`}>
                        {r.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[12px] text-gray-500 mt-0.5">{r.intern_role}</p>
                    <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{r.email}</span>
                      {r.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{r.phone}</span>}
                      {r.internship_start && r.internship_end && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(r.internship_start).toLocaleDateString()} → {new Date(r.internship_end).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setViewItem(r)} className="px-3 py-1.5 text-[11px] font-medium text-[#0A4FE8] hover:bg-blue-50 rounded-lg transition">
                      View
                    </button>
                    {r.status === "pending" && (
                      <>
                        <button onClick={() => updateStatus(r.id, "approved")} className="p-2 rounded-lg text-emerald-500 hover:bg-emerald-50 transition" title="Approve">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => updateStatus(r.id, "rejected")} className="p-2 rounded-lg text-red-400 hover:bg-red-50 transition" title="Reject">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <button onClick={() => updateStatus(r.id, "issued")} className="px-3 py-1.5 text-[11px] font-medium bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition">
                        Mark Issued
                      </button>
                    )}
                    <button onClick={() => handleDelete(r.id)} className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {viewItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#0D1B39]">Certification Request</h2>
              <button onClick={() => setViewItem(null)} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <Detail label="Full Name" value={viewItem.full_name} />
              <Detail label="Email" value={viewItem.email} />
              <Detail label="Phone" value={viewItem.phone || "-"} />
              <Detail label="Intern Role" value={viewItem.intern_role} />
              <Detail label="Period" value={viewItem.internship_start && viewItem.internship_end ? `${new Date(viewItem.internship_start).toLocaleDateString()} → ${new Date(viewItem.internship_end).toLocaleDateString()}` : "-"} />
              <Detail label="Supervisor" value={viewItem.supervisor_name || "-"} />
              <Detail label="Notes" value={viewItem.notes || "-"} />
              <Detail label="Status" value={viewItem.status.toUpperCase()} />
              <Detail label="Submitted" value={new Date(viewItem.created_at).toLocaleString()} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex text-sm">
      <span className="w-32 flex-shrink-0 text-gray-400 font-medium text-[12px]">{label}</span>
      <span className="text-[#0D1B39] text-[13px]">{value}</span>
    </div>
  );
}
