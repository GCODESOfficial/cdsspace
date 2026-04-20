'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import { CURRENCIES, Currency, FinancePriceItem, formatMoney } from "@/lib/finance/types";

interface Row { name: string; description: string; quantity: string; unit_price: string; isNew: boolean; }
interface ProjectLite { id: string; name: string; client: string; currency: Currency; }
interface MilestoneLite { id: string; description: string; budget: number; }

export default function NewInvoicePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [milestones, setMilestones] = useState<MilestoneLite[]>([]);
  const [priceItems, setPriceItems] = useState<FinancePriceItem[]>([]);
  const [scope, setScope] = useState<"custom" | "project" | "milestone" | "monthly">("custom");
  const [projectId, setProjectId] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [client, setClient] = useState({ name: "", email: "", address: "" });
  const [currency, setCurrency] = useState<Currency>("NGN");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([{ name: "", description: "", quantity: "1", unit_price: "0", isNew: false }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/finance/projects").then((r) => r.json()).then((d) => setProjects(d.projects ?? []));
    fetch("/api/admin/finance/price-list").then((r) => r.json()).then((d) => setPriceItems(d.items ?? []));
  }, []);

  useEffect(() => {
    if (!projectId) { setMilestones([]); return; }
    fetch(`/api/admin/finance/projects/${projectId}`).then((r) => r.json()).then((d) => {
      setMilestones(d.milestones ?? []);
      if (d.project) {
        setCurrency(d.project.currency);
        setClient((c) => ({ ...c, name: c.name || d.project.client }));
      }
    });
  }, [projectId]);

  // Auto-fill from milestone
  useEffect(() => {
    if (scope === "milestone" && milestoneId) {
      const m = milestones.find((x) => x.id === milestoneId);
      if (m) setRows([{ name: m.description, description: "", quantity: "1", unit_price: String(m.budget), isNew: false }]);
    }
  }, [milestoneId, scope, milestones]);

  const updateRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addRow = () => setRows((rs) => [...rs, { name: "", description: "", quantity: "1", unit_price: "0", isNew: true }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const pickPriceItem = (i: number, name: string) => {
    const found = priceItems.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (found) {
      updateRow(i, { name: found.name, description: found.description ?? "", unit_price: String(found.unit_price), isNew: false });
    } else {
      updateRow(i, { name, isNew: true });
    }
  };

  const subtotal = rows.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unit_price || 0), 0);
  const taxAmt = (subtotal - Number(discount || 0)) * (Number(taxRate || 0) / 100);
  const total = subtotal - Number(discount || 0) + taxAmt;

  const save = async () => {
    if (!client.name || rows.length === 0) { alert("Client name and at least one item required"); return; }
    setSaving(true);
    const r = await fetch("/api/admin/finance/invoices", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId || null, milestone_id: milestoneId || null,
        client_name: client.name, client_email: client.email, client_address: client.address,
        currency, tax_rate: Number(taxRate), discount: Number(discount),
        scope, period_month: scope === "monthly" ? periodMonth : null,
        issue_date: issueDate, due_date: dueDate || null, notes,
        items: rows.map((r) => ({
          name: r.name, description: r.description, quantity: Number(r.quantity), unit_price: Number(r.unit_price), isNew: r.isNew,
        })),
      }),
    });
    setSaving(false);
    if (r.ok) { const d = await r.json(); router.push(`/admin/finance/invoices/${d.invoice.id}`); }
    else { const d = await r.json(); alert(d.error || "Failed"); }
  };

  return (
    <FinanceShell
      title="New Invoice"
      back={{ href: "/admin/finance/invoices", label: "Invoices" }}
      actions={
        <Button onClick={save} disabled={saving} className="h-11 px-6 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">
          {saving ? "Creating…" : "Create Invoice"}
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: details + items */}
        <div className="lg:col-span-2 space-y-6">
          <div className={`${glassCard} p-6`}>
            <h3 className="font-semibold text-gray-900 mb-4">Scope</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(["custom", "project", "milestone", "monthly"] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)} className={`py-2.5 rounded-xl text-sm font-medium capitalize transition ${scope === s ? "bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30" : "bg-white/70 text-gray-600 hover:bg-white"}`}>{s}</button>
              ))}
            </div>
            {scope !== "custom" && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Project">
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.client}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                {scope === "milestone" && (
                  <Field label="Milestone">
                    <Select value={milestoneId} onValueChange={setMilestoneId}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select milestone" /></SelectTrigger>
                      <SelectContent>{milestones.map((m) => <SelectItem key={m.id} value={m.id}>{m.description}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                )}
                {scope === "monthly" && (
                  <Field label="Month"><Input type="month" className="h-11 rounded-xl" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} /></Field>
                )}
              </div>
            )}
          </div>

          <div className={`${glassCard} p-6`}>
            <h3 className="font-semibold text-gray-900 mb-4">Bill To</h3>
            <div className="space-y-4">
              <Field label="Client Name"><Input className="h-11 rounded-xl" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Email"><Input className="h-11 rounded-xl" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} /></Field>
                <Field label="Address"><Input className="h-11 rounded-xl" value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} /></Field>
              </div>
            </div>
          </div>

          <div className={`${glassCard} p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Items</h3>
              <Button onClick={addRow} variant="outline" size="sm" className="rounded-xl"><Plus className="w-4 h-4 mr-1" /> Add Item</Button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Type a name to search the price list, or enter a new item — new items are auto-saved to your price list.</p>
            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="rounded-xl bg-white/60 border border-white/80 p-3">
                  <div className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-12 md:col-span-5">
                      <input
                        list={`pl-${i}`}
                        value={r.name}
                        onChange={(e) => pickPriceItem(i, e.target.value)}
                        placeholder="Item name"
                        className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                      />
                      <datalist id={`pl-${i}`}>
                        {priceItems.map((p) => <option key={p.id} value={p.name}>{formatMoney(p.unit_price, p.currency)}</option>)}
                      </datalist>
                      <input value={r.description} onChange={(e) => updateRow(i, { description: e.target.value })} placeholder="Description (optional)" className="w-full h-9 px-3 mt-2 rounded-lg border border-gray-200 text-xs bg-white" />
                    </div>
                    <div className="col-span-3 md:col-span-2"><input type="number" value={r.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white" placeholder="Qty" /></div>
                    <div className="col-span-5 md:col-span-3"><input type="number" value={r.unit_price} onChange={(e) => updateRow(i, { unit_price: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white" placeholder="Unit price" /></div>
                    <div className="col-span-3 md:col-span-1 text-right text-sm font-semibold pt-2.5">{formatMoney(Number(r.quantity || 0) * Number(r.unit_price || 0), currency)}</div>
                    <div className="col-span-1 text-right">
                      <button onClick={() => removeRow(i)} className="w-9 h-9 rounded-lg hover:bg-red-50 grid place-items-center text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${glassCard} p-6`}>
            <h3 className="font-semibold text-gray-900 mb-4">Notes</h3>
            <Textarea className="rounded-xl min-h-[90px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {/* RIGHT: summary */}
        <div className="space-y-6">
          <div className={`${glassCard} p-6`}>
            <h3 className="font-semibold text-gray-900 mb-4">Settings</h3>
            <div className="space-y-4">
              <Field label="Currency">
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Issue Date"><Input type="date" className="h-11 rounded-xl" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></Field>
                <Field label="Due Date"><Input type="date" className="h-11 rounded-xl" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tax %"><Input type="number" className="h-11 rounded-xl" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></Field>
                <Field label="Discount"><Input type="number" className="h-11 rounded-xl" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
              </div>
            </div>
          </div>

          <div className={`${glassCard} p-6`}>
            <h3 className="font-semibold text-gray-900 mb-4">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatMoney(subtotal, currency)}</span></div>
              {Number(discount) > 0 && <div className="flex justify-between text-gray-600"><span>Discount</span><span>− {formatMoney(Number(discount), currency)}</span></div>}
              {Number(taxRate) > 0 && <div className="flex justify-between text-gray-600"><span>Tax ({taxRate}%)</span><span>{formatMoney(taxAmt, currency)}</span></div>}
              <div className="flex justify-between pt-3 border-t border-gray-200 text-lg font-bold"><span>Total</span><span>{formatMoney(total, currency)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </FinanceShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-gray-500">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
