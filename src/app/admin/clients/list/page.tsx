"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Loader2, Plus, Pencil, Save, X, Building2, Search, Mail, Phone, Filter } from "lucide-react";
import BulkActionBar from "@/components/admin/BulkActionBar";
import { INDUSTRY_CATEGORIES } from "@/lib/industry-categories";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

interface Client {
  id: string;
  name: string;
  brand_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  industry: string | null;
  contact_person: string | null;
  notes: string | null;
  status: string;
  birthday: string | null;
  created_at: string;
}

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "lead", label: "Lead" },
  { key: "inactive", label: "Inactive" },
  { key: "archived", label: "Archived" },
];

export default function ClientsListPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Form fields
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [industry, setIndustry] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("active");
  const [birthday, setBirthday] = useState("");

  useEffect(() => { fetchClients(); }, []);

  async function fetchClients() {
    setIsFetching(true);
    const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    setClients(data || []);
    setIsFetching(false);
  }

  function resetForm() {
    setName(""); setBrandName(""); setEmail(""); setPhone(""); setWhatsapp("");
    setIndustry(""); setContactPerson(""); setNotes(""); setStatus("active");
    setBirthday("");
    setEditId(null);
  }

  function startEdit(c: Client) {
    setEditId(c.id);
    setName(c.name);
    setBrandName(c.brand_name || "");
    setEmail(c.email || "");
    setPhone(c.phone || "");
    setWhatsapp(c.whatsapp || "");
    setIndustry(c.industry || "");
    setContactPerson(c.contact_person || "");
    setNotes(c.notes || "");
    setStatus(c.status);
    setBirthday(c.birthday ? c.birthday.slice(0, 10) : "");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Missing name", description: "Client name is required", variant: "destructive" });
      return;
    }
    setIsLoading(true);

    const payload = {
      name: name.trim(),
      brand_name: brandName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      industry: industry || null,
      contact_person: contactPerson.trim() || null,
      notes: notes.trim() || null,
      status,
      birthday: birthday || null,
    };

    const { error } = editId
      ? await supabase.from("clients").update(payload).eq("id", editId)
      : await supabase.from("clients").insert(payload);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editId ? "Updated" : "Added", description: editId ? "Client updated" : "Client added" });
      resetForm();
      setShowForm(false);
      fetchClients();
    }
    setIsLoading(false);
  }

  async function handleDelete(id: string) {
    if (!(await appConfirm("Delete this client?"))) return;
    await supabase.from("clients").delete().eq("id", id);
    fetchClients();
  }

  async function handleBulkDelete() {
    if (!(await appConfirm(`Delete ${selected.size} clients?`))) return;
    await supabase.from("clients").delete().in("id", Array.from(selected));
    setSelected(new Set());
    fetchClients();
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.brand_name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const toggleAll = () => selected.size === filtered.length ? setSelected(new Set()) : setSelected(new Set(filtered.map(c => c.id)));

  const statusColors: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-600",
    lead: "bg-blue-50 text-[#0A4FE8]",
    inactive: "bg-gray-100 text-gray-500",
    archived: "bg-amber-50 text-amber-600",
  };

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Management</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Client / Brand List</h1>
          <p className="text-gray-400 text-[13px] mt-1">Centralized list of all clients used across the admin panel</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition">
          {showForm ? "Cancel" : <><Plus className="w-4 h-4" /> Add Client</>}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
          <h2 className="text-[15px] font-semibold text-[#0D1B39] mb-5 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#0A4FE8]" />
            {editId ? "Edit Client" : "New Client"}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <Field label="Client Name *" value={name} onChange={setName} placeholder="John Doe / Acme Inc." />
            <Field label="Brand Name" value={brandName} onChange={setBrandName} placeholder="(Optional)" />
            <Field label="Contact Person" value={contactPerson} onChange={setContactPerson} placeholder="Primary contact" />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Industry</label>
              <select value={industry} onChange={(e) => setIndustry(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer">
                <option value="">Select industry</option>
                {INDUSTRY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="email@..." />
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 555..." />
            <Field label="WhatsApp" value={whatsapp} onChange={setWhatsapp} placeholder="+1 555..." />
            <Field label="Birthday" type="date" value={birthday} onChange={setBirthday} />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer">
                <option value="active">Active</option>
                <option value="lead">Lead</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editId ? "Save Changes" : "Add Client"}
              </button>
              <button type="button" onClick={() => { resetForm(); setShowForm(false); }}
                className="px-4 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <BulkActionBar selectedCount={selected.size} onClear={() => setSelected(new Set())}
          actions={[{ label: "Delete", icon: <Trash2 className="w-3.5 h-3.5" />, onClick: handleBulkDelete, variant: "danger" as const }]} />
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input placeholder="Search by name, brand, or email..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-full rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            {STATUS_FILTERS.map(f => (
              <button key={f.key} onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition ${
                  statusFilter === f.key ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-500 border border-gray-200 hover:border-blue-200"
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isFetching ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No clients found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-2.5 px-6 w-10">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer" />
                </th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Name / Brand</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Industry</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Contact</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-right py-2.5 px-6 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition ${selected.has(c.id) ? "bg-blue-50/40" : ""}`}>
                  <td className="py-3 px-6">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)}
                      className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer" />
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-[#0A4FE8] text-sm font-bold flex-shrink-0">
                        {(c.brand_name || c.name).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-[#0D1B39]">{c.brand_name || c.name}</p>
                        {c.brand_name && <p className="text-[11px] text-gray-400">{c.name}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    {c.industry ? (
                      <span className="inline-block px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 text-[11px] font-medium">{c.industry}</span>
                    ) : <span className="text-gray-300 text-[12px]">-</span>}
                  </td>
                  <td className="py-3 px-3">
                    {c.email && <p className="text-[12px] text-gray-600 flex items-center gap-1"><Mail className="w-3 h-3 text-gray-300" />{c.email}</p>}
                    {c.phone && <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3 text-gray-300" />{c.phone}</p>}
                  </td>
                  <td className="py-3 px-3">
                    <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-medium capitalize ${statusColors[c.status] || "bg-gray-100 text-gray-500"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3 px-6">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => startEdit(c)} className="p-1.5 rounded-md text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
    </div>
  );
}
