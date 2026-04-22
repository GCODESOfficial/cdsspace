'use client';

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import ModalHeader from "@/components/finance/ModalHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Tag, Search, Upload, Download, Trash2, Edit2, ImageIcon } from "lucide-react";
import { CURRENCIES, Currency, FinancePriceItem, formatMoney } from "@/lib/finance/types";
import { AIAssistButton } from "@/components/ai/AIAssistButton";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import Image from "next/image";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

const EMPTY = { name: "", description: "", unit_price: "", currency: "NGN" as Currency, category: "", image_url: "" };

export default function PriceListPage() {
  const [items, setItems] = useState<FinancePriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FinancePriceItem | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/admin/finance/price-list");
    const d = await r.json();
    setItems(d.items ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (it: FinancePriceItem) => {
    setEditing(it);
    setForm({
      name: it.name, description: it.description ?? "", unit_price: String(it.unit_price),
      currency: it.currency, category: it.category ?? "", image_url: it.image_url ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.unit_price) return;
    const payload = { ...form, unit_price: Number(form.unit_price) };
    const url = editing ? `/api/admin/finance/price-list/${editing.id}` : "/api/admin/finance/price-list";
    const method = editing ? "PATCH" : "POST";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (r.ok) { setOpen(false); load(); } else appAlert("Failed");
  };

  const remove = async (id: string) => {
    if (!(await appConfirm("Delete this item?"))) return;
    await fetch(`/api/admin/finance/price-list/${id}`, { method: "DELETE" });
    load();
  };

  const uploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    const fd = new FormData(); fd.append("file", f); fd.append("folder", "finance/price-items");
    const r = await fetch("/api/admin/finance/upload", { method: "POST", body: fd });
    setUploading(false);
    if (r.ok) { const d = await r.json(); setForm((p) => ({ ...p, image_url: d.url })); }
    else appAlert("Upload failed");
  };

  const importCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/admin/finance/price-list/import", { method: "POST", body: fd });
    if (r.ok) { const d = await r.json(); appAlert(`Imported ${d.inserted} items`); load(); }
    else { const d = await r.json(); appAlert(d.error || "Import failed"); }
    if (csvRef.current) csvRef.current.value = "";
  };

  const downloadTemplate = () => {
    const csv = "name,description,unit_price,currency,category\nLogo Design,Custom logo design,150000,NGN,Branding\nWebsite,Landing page build,500000,NGN,Web\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "price-list-template.csv"; a.click();
  };

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.category ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <FinanceShell
      title="Price List"
      subtitle="All products & services with their unit prices."
      actions={
        <>
          <input ref={csvRef} type="file" accept=".csv" hidden onChange={importCsv} />
          <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={downloadTemplate}>
            <Download className="w-4 h-4 mr-1.5" /> Template
          </Button>
          <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={() => csvRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1.5" /> Import CSV
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">
                <Plus className="w-4 h-4 mr-1.5" /> New Item
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-xl rounded-2xl border-0 shadow-2xl p-7">
              <ModalHeader icon={Tag} title={editing ? "Edit Price Item" : "Add Price Item"} subtitle="Reusable products & services for invoices" accent="from-fuchsia-500 to-pink-500" />
              <div className="space-y-4 mt-2">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-xl bg-gray-50 border border-dashed border-gray-200 grid place-items-center overflow-hidden flex-shrink-0">
                    {form.image_url ? <Image src={form.image_url} alt="" width={80} height={80} className="object-cover" /> : <ImageIcon className="w-6 h-6 text-gray-300" />}
                  </div>
                  <div className="flex-1">
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadImage} />
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => fileRef.current?.click()} disabled={uploading}>
                      {uploading ? "Uploading…" : form.image_url ? "Replace Image" : "Add Image (optional)"}
                    </Button>
                  </div>
                </div>
                <Field label="Name"><Input className="h-11 rounded-xl" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field
                  label={
                    <span className="flex items-center justify-between gap-2 w-full">
                      Description
                      <AIAssistButton
                        kind="price_item_description"
                        input={{ name: form.name, category: form.category, notes: form.description }}
                        onAccept={(text) => setForm({ ...form, description: text })}
                      />
                    </span>
                  }
                >
                  <Textarea className="rounded-xl min-h-[70px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Unit Price"><Input type="number" className="h-11 rounded-xl" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} /></Field>
                  <Field label="Currency">
                    <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as Currency })}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Category"><Input className="h-11 rounded-xl" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Branding, Web, Print" /></Field>
              </div>
              <DialogFooter className="mt-5">
                <Button variant="outline" className="h-11 px-5 rounded-xl" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <div className={`${glassCard} p-4 mb-6 flex items-center gap-3`}>
        <Search className="w-5 h-5 text-gray-400 ml-2" />
        <input
          type="text"
          placeholder="Search items by name or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent outline-none text-sm"
        />
        <span className="text-xs text-gray-500">{filtered.length} item{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {loading ? (
        <div className={`${glassCard} p-10 text-center text-gray-500`}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className={`${glassCard} p-14 text-center`}>
          <div className="w-14 h-14 rounded-2xl bg-fuchsia-50 grid place-items-center mx-auto mb-4">
            <Tag className="w-7 h-7 text-fuchsia-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No items yet</h3>
          <p className="text-gray-500 mt-1">Add a price item or import from CSV.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((it) => (
            <div key={it.id} className={`${glassCard} p-5`}>
              <div className="flex gap-3">
                <div className="w-16 h-16 rounded-xl bg-gray-50 overflow-hidden flex-shrink-0 grid place-items-center">
                  {it.image_url ? <Image src={it.image_url} alt={it.name} width={64} height={64} className="object-cover w-16 h-16" /> : <Tag className="w-6 h-6 text-gray-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{it.name}</h3>
                  {it.category && <p className="text-xs text-gray-500">{it.category}</p>}
                  <div className="text-blue-700 font-bold mt-1">{formatMoney(it.unit_price, it.currency)}</div>
                </div>
              </div>
              {it.description && <p className="text-xs text-gray-500 mt-3 line-clamp-2">{it.description}</p>}
              <div className="flex justify-end gap-1 mt-3">
                <button onClick={() => openEdit(it)} className="w-8 h-8 rounded-lg hover:bg-blue-50 grid place-items-center text-gray-500 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => remove(it.id)} className="w-8 h-8 rounded-lg hover:bg-red-50 grid place-items-center text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </FinanceShell>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-gray-500">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
