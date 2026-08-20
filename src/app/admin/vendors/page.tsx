"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Search, Pencil, Trash2, Building2, Mail, Phone, MapPin, X, Save } from "lucide-react";
import { appAlert, appConfirm } from "@/lib/app-notify";

interface Vendor {
  id: string;
  name: string;
  vendor_type: string;
  agreement_status: string;
  agreement_notes: string | null;
  business_niche: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  office_location: string | null;
  start_date: string | null;
  notes: string | null;
  created_at: string;
}

const TYPES = [
  { key: "subcontractor", label: "Sub-contractor" },
  { key: "vendor", label: "Vendor" },
  { key: "supplier", label: "Supplier" },
  { key: "partner", label: "Partner" },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.key, t.label]));

const AGREEMENTS = [
  { key: "none", label: "No agreement" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "expired", label: "Expired" },
];
const AGREEMENT_STYLE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  expired: "bg-rose-50 text-rose-700 ring-rose-200",
  none: "bg-slate-100 text-slate-500 ring-slate-200",
};

type FormState = Omit<Vendor, "id" | "created_at">;

const EMPTY: FormState = {
  name: "", vendor_type: "vendor", agreement_status: "none", agreement_notes: "",
  business_niche: "", phone: "", whatsapp: "", email: "", office_location: "", start_date: "", notes: "",
};

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/vendors")
      .then((r) => r.json())
      .then((d) => setVendors(d.vendors ?? []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditId(null); setForm(EMPTY); setShowForm(true); };
  const openEdit = (v: Vendor) => {
    setEditId(v.id);
    setForm({
      name: v.name, vendor_type: v.vendor_type, agreement_status: v.agreement_status,
      agreement_notes: v.agreement_notes || "", business_niche: v.business_niche || "",
      phone: v.phone || "", whatsapp: v.whatsapp || "", email: v.email || "",
      office_location: v.office_location || "", start_date: v.start_date ? v.start_date.slice(0, 10) : "", notes: v.notes || "",
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) { appAlert("Vendor name is required."); return; }
    setSaving(true);
    try {
      const url = editId ? `/api/admin/vendors/${editId}` : "/api/admin/vendors";
      const res = await fetch(url, {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, start_date: form.start_date || null }),
      });
      const d = await res.json();
      if (!res.ok) { appAlert(d.error || "Could not save vendor."); return; }
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (v: Vendor) => {
    if (!(await appConfirm(`Delete "${v.name}"? This cannot be undone.`))) return;
    await fetch(`/api/admin/vendors/${v.id}`, { method: "DELETE" });
    load();
  };

  const filtered = useMemo(() => vendors.filter((v) => {
    if (typeFilter !== "all" && v.vendor_type !== typeFilter) return false;
    const hay = [v.name, v.business_niche, v.email, v.office_location].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(search.toLowerCase());
  }), [vendors, typeFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: vendors.length };
    for (const t of TYPES) c[t.key] = vendors.filter((v) => v.vendor_type === t.key).length;
    return c;
  }, [vendors]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-[#0D1B39]">Vendors</h1>
          <p className="mt-1 text-[13px] text-slate-500">Sub-contractors, vendors under agreement, suppliers and partners.</p>
        </div>
        <button onClick={openCreate}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[13px] font-bold text-white shadow-lg shadow-blue-600/30">
          <Plus className="h-4 w-4" /> Add vendor
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors…"
            className="flex-1 bg-transparent text-sm outline-none" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[{ key: "all", label: "All" }, ...TYPES].map((t) => {
            const active = typeFilter === t.key;
            return (
              <button key={t.key} type="button" onClick={() => setTypeFilter(t.key)}
                className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition ${active ? "border-transparent bg-[#0A4FE8] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                {t.label}
                <span className={`ml-1.5 rounded-full px-1.5 text-[10px] font-bold ${active ? "bg-white/20" : "bg-slate-100"}`}>{counts[t.key] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50"><Building2 className="h-7 w-7 text-[#0A4FE8]" /></div>
            <h3 className="mt-4 text-lg font-semibold text-[#0D1B39]">No vendors yet</h3>
            <p className="mt-1 text-slate-500">Add a sub-contractor, vendor, supplier or partner to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50/70">
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-4">Vendor</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4">Contact</th>
                  <th className="px-5 py-4">Agreement</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-[#0D1B39]">{v.name}</p>
                      {v.business_niche && <p className="text-[12px] text-slate-500">{v.business_niche}</p>}
                      {v.office_location && (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-400"><MapPin className="h-3 w-3" /> {v.office_location}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#0A4FE8]">{TYPE_LABEL[v.vendor_type] || v.vendor_type}</span>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {v.email && <p className="inline-flex items-center gap-1 text-[12px]"><Mail className="h-3 w-3 text-slate-400" /> {v.email}</p>}
                      {v.phone && <p className="inline-flex items-center gap-1 text-[12px]"><Phone className="h-3 w-3 text-slate-400" /> {v.phone}</p>}
                      {!v.email && !v.phone && <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${AGREEMENT_STYLE[v.agreement_status] || AGREEMENT_STYLE.none}`}>
                        {v.agreement_status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(v)} title="Edit" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#0A4FE8]"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => remove(v)} title="Delete" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => !saving && setShowForm(false)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-lg font-bold text-[#0D1B39]">{editId ? "Edit vendor" : "New vendor"}</h3>
              <button onClick={() => setShowForm(false)} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-6">
              <Field label="Vendor name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Type" value={form.vendor_type} onChange={(v) => setForm({ ...form, vendor_type: v })} options={TYPES} />
                <Select label="Agreement" value={form.agreement_status} onChange={(v) => setForm({ ...form, agreement_status: v })} options={AGREEMENTS} />
              </div>
              <Field label="Business / niche" value={form.business_niche || ""} onChange={(v) => setForm({ ...form, business_niche: v })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone" value={form.phone || ""} onChange={(v) => setForm({ ...form, phone: v })} />
                <Field label="WhatsApp" value={form.whatsapp || ""} onChange={(v) => setForm({ ...form, whatsapp: v })} />
              </div>
              <Field label="Email" value={form.email || ""} onChange={(v) => setForm({ ...form, email: v })} />
              <Field label="Office location" value={form.office_location || ""} onChange={(v) => setForm({ ...form, office_location: v })} />
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-slate-600">Notes</label>
                <textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-blue-300 focus:bg-white" />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button onClick={() => setShowForm(false)} disabled={saving} className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-500">Cancel</button>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {editId ? "Save changes" : "Add vendor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-semibold text-slate-600">{label}{required && <span className="text-rose-500"> *</span>}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-blue-300 focus:bg-white" />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { key: string; label: string }[] }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-semibold text-slate-600">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-blue-300 focus:bg-white">
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </div>
  );
}
