"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Search, Copy, Check, Send, Trash2, ChevronLeft, ChevronRight, Eye, Clock, Archive } from "lucide-react";
import BulkActionBar from "@/components/admin/BulkActionBar";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

interface AccessCode {
  id: number;
  code: string;
  whatsapp_contact: string;
  expires_at: string;
  created_at: string;
}

export default function ViewCodesPage() {
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const itemsPerPage = 10;

  useEffect(() => { fetchCodes(); }, []);

  const fetchCodes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("access_codes")
      .select("id, code, whatsapp_contact, expires_at, created_at")
      .order("created_at", { ascending: false });
    if (!error && data) setCodes(data as AccessCode[]);
    setLoading(false);
  };

  const handleCopy = async (code: string, id: number) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleResend = (contact: string, code: string) => {
    const msg = encodeURIComponent(`Hi! Your project access code is: ${code}\nVisit: https://cdsspace.pro/access\nEnter the code to access your brand identity design page.`);
    window.open(`https://wa.me/${contact.replace(/\D/g, "")}?text=${msg}`, "_blank");
  };

  const handleDelete = async (id: number) => {
    if (!(await appConfirm("Delete this code?"))) return;
    const { error } = await supabase.from("access_codes").delete().eq("id", id);
    if (!error) setCodes((prev) => prev.filter((c) => c.id !== id));
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map((c) => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!(await appConfirm(`Delete ${selected.size} selected codes?`))) return;
    for (const id of selected) {
      const { error } = await supabase.from("access_codes").delete().eq("id", id);
      if (!error) setCodes((prev) => prev.filter((c) => c.id !== id));
    }
    setSelected(new Set());
  };

  const filtered = codes.filter((c) =>
    c.code.toLowerCase().includes(search.toLowerCase()) || c.whatsapp_contact.includes(search)
  );
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const isExpired = (date: string) => new Date(date) < new Date();

  return (
    <div className="p-8 max-w-[1000px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Access Management</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">View Codes</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="px-3 py-1.5 rounded-lg bg-blue-50 text-[#0A4FE8] font-medium">{codes.length} total</div>
          <div className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 font-medium">{codes.filter(c => !isExpired(c.expires_at)).length} active</div>
        </div>
      </div>

      {selected.size > 0 && (
        <BulkActionBar
          selectedCount={selected.size}
          onClear={() => setSelected(new Set())}
          actions={[
            {
              label: "Delete",
              icon: <Trash2 className="w-4 h-4" />,
              onClick: handleBulkDelete,
              variant: "danger" as const,
            },
          ]}
        />
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Search */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              placeholder="Search by code or number..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-9 pr-4 py-2 w-full rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No codes found</div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2.5 px-6 w-10">
                    <input
                      type="checkbox"
                      checked={paginated.length > 0 && selected.size === paginated.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] focus:ring-blue-200 cursor-pointer"
                    />
                  </th>
                  <th className="text-left py-2.5 px-6 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Code</th>
                  <th className="text-left py-2.5 px-6 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">WhatsApp</th>
                  <th className="text-left py-2.5 px-6 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-left py-2.5 px-6 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Expires</th>
                  <th className="text-right py-2.5 px-6 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((item) => {
                  const expired = isExpired(item.expires_at);
                  return (
                    <tr key={item.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition ${selected.has(item.id) ? "bg-blue-50/40" : ""}`}>
                      <td className="py-3 px-6 w-10">
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] focus:ring-blue-200 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-6">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[13px] font-semibold text-[#0D1B39] tracking-wider">{item.code}</span>
                          <button onClick={() => handleCopy(item.code, item.id)} className="p-1 rounded-md text-gray-300 hover:text-[#0A4FE8] hover:bg-blue-50 transition">
                            {copiedCode === item.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-6 text-[13px] text-gray-600 font-mono">{item.whatsapp_contact}</td>
                      <td className="py-3 px-6">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                          expired ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-600"
                        }`}>
                          <Clock className="w-3 h-3" />
                          {expired ? "Expired" : "Active"}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-[13px] text-gray-500">{new Date(item.expires_at).toLocaleDateString()}</td>
                      <td className="py-3 px-6">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleResend(item.whatsapp_contact, item.code)} className="p-1.5 rounded-md text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition" title="Resend">
                            <Send className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-gray-50">
                <p className="text-[11px] text-gray-400">{filtered.length} codes</p>
                <div className="flex items-center gap-1">
                  <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition"><ChevronLeft className="w-4 h-4" /></button>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button key={i} onClick={() => setCurrentPage(i + 1)} className={`w-7 h-7 rounded-lg text-xs font-medium transition ${currentPage === i + 1 ? "bg-[#0A4FE8] text-white" : "text-gray-500 hover:bg-gray-100"}`}>{i + 1}</button>
                  ))}
                  <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
