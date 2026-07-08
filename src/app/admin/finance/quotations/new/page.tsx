/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageIcon, Link as LinkIcon, Plus, Trash2, Upload } from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import {
  CURRENCIES,
  Currency,
  DEFAULT_QUOTATION_ESTIMATE_NOTE,
  DEFAULT_REVISIONS_NOTE,
  DEFAULT_WORKING_HOURS,
  FinancePriceItem,
  QUOTATION_DELIVERY_PERIODS,
  formatMoney,
} from "@/lib/finance/types";
import { AIAssistButton } from "@/components/ai/AIAssistButton";
import { appAlert } from "@/lib/app-notify";

interface Row { name: string; description: string; quantity: string; unit_price: string; isNew: boolean; }
interface ProjectLite { id: string; name: string; client: string; currency: Currency; }
interface MilestoneLite { id: string; description: string; budget: number; }
interface ClientLite {
  id: string;
  name: string;
  brand_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  industry?: string | null;
}
interface SampleRow { kind: "image" | "link"; url: string; label: string; }

export default function NewQuotationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editDraftId = searchParams.get("draft");
  const [hydrating, setHydrating] = useState<boolean>(!!editDraftId);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [milestones, setMilestones] = useState<MilestoneLite[]>([]);
  const [priceItems, setPriceItems] = useState<FinancePriceItem[]>([]);
  const [scope, setScope] = useState<"custom" | "project" | "milestone" | "monthly">("custom");
  const [projectId, setProjectId] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [projectName, setProjectName] = useState("");
  const [client, setClient] = useState({ name: "", email: "", address: "" });
  const [currency, setCurrency] = useState<Currency>("NGN");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [estimateNote, setEstimateNote] = useState(DEFAULT_QUOTATION_ESTIMATE_NOTE);
  const [revisionsNote, setRevisionsNote] = useState(DEFAULT_REVISIONS_NOTE);
  const [workingHours, setWorkingHours] = useState(DEFAULT_WORKING_HOURS);
  const [deliveryPeriod, setDeliveryPeriod] = useState<string>(QUOTATION_DELIVERY_PERIODS[0]);
  const [rows, setRows] = useState<Row[]>([{ name: "", description: "", quantity: "1", unit_price: "0", isNew: false }]);
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [sampleForm, setSampleForm] = useState({ kind: "image" as "image" | "link", url: "", label: "" });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [clientMatches, setClientMatches] = useState<ClientLite[]>([]);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);

  useEffect(() => {
    fetch("/api/admin/finance/projects").then((r) => r.json()).then((d) => setProjects(d.projects ?? []));
    fetch("/api/admin/finance/price-list").then((r) => r.json()).then((d) => setPriceItems(d.items ?? []));
  }, []);

  useEffect(() => {
    if (hydrating) return;
    const q = clientQuery.trim();
    if (q.length < 1) { setClientMatches([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/clients/lookup?q=${encodeURIComponent(q)}&limit=8`);
        if (!r.ok) { setClientMatches([]); return; }
        const d = await r.json();
        setClientMatches(Array.isArray(d.clients) ? d.clients : []);
      } catch {
        setClientMatches([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [clientQuery, hydrating]);

  const applyClient = (c: ClientLite) => {
    setClient({ name: c.name, email: c.email ?? "", address: c.address ?? "" });
    setClientQuery("");
    setClientMenuOpen(false);
  };

  const createNewClient = async () => {
    const name = (clientQuery || client.name || "").trim();
    if (!name) { appAlert("Type a client name first."); return; }
    setCreatingClient(true);
    try {
      const r = await fetch("/api/admin/clients/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: client.email || null, address: client.address || null }),
      });
      const d = await r.json();
      if (!r.ok) { appAlert(d.error || "Couldn't save client."); return; }
      applyClient(d.client as ClientLite);
    } finally {
      setCreatingClient(false);
    }
  };

  useEffect(() => {
    if (!projectId) { setMilestones([]); return; }
    fetch(`/api/admin/finance/projects/${projectId}`).then((r) => r.json()).then((d) => {
      setMilestones(d.milestones ?? []);
      if (d.project) {
        setCurrency(d.project.currency);
        setProjectName((name) => name || d.project.name);
        setClient((c) => ({ ...c, name: c.name || d.project.client }));
      }
    });
  }, [projectId]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!editDraftId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/finance/quotations/${editDraftId}`);
        if (!r.ok) {
          setHydrating(false);
          return;
        }
        const d = await r.json();
        if (cancelled || !d?.quotation) return;
        const q = d.quotation;
        localStorage.removeItem("pending_quotation");
        setScope((q.scope as typeof scope) || "custom");
        setProjectId(q.project_id || "");
        setMilestoneId(q.milestone_id || "");
        setPeriodMonth(q.period_month || "");
        setProjectName(q.project_name || "");
        setClient({ name: q.client_name || "", email: q.client_email || "", address: q.client_address || "" });
        setCurrency((q.currency as Currency) || "NGN");
        setIssueDate(q.issue_date || new Date().toISOString().slice(0, 10));
        setValidUntil(q.valid_until || "");
        setTaxRate(String(q.tax_rate ?? "0"));
        setDiscount(String(q.discount ?? "0"));
        setNotes(q.notes || "");
        setEstimateNote(q.estimate_note || DEFAULT_QUOTATION_ESTIMATE_NOTE);
        setRevisionsNote(q.revisions_note || DEFAULT_REVISIONS_NOTE);
        setWorkingHours(q.working_hours || DEFAULT_WORKING_HOURS);
        setDeliveryPeriod(q.delivery_period || QUOTATION_DELIVERY_PERIODS[0]);
        setSamples((d.samples ?? []).map((s: any) => ({ kind: s.kind === "image" ? "image" : "link", url: s.url, label: s.label || "" })));
        const items = (d.items ?? []) as Array<{ name: string; description: string | null; quantity: number; unit_price: number }>;
        if (items.length) {
          setRows(items.map((it) => ({
            name: it.name ?? "",
            description: it.description ?? "",
            quantity: String(it.quantity ?? 1),
            unit_price: String(it.unit_price ?? 0),
            isNew: false,
          })));
        }
        setDraftId(q.id);
      } catch (e) {
        console.error("Failed to hydrate quotation", e);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editDraftId]);

  useEffect(() => {
    if (editDraftId) return;
    const saved = localStorage.getItem("pending_quotation");
    if (saved) {
      try {
        const d = JSON.parse(saved);
        setScope(d.scope || "custom");
        setProjectId(d.projectId || "");
        setMilestoneId(d.milestoneId || "");
        setPeriodMonth(d.periodMonth || "");
        setProjectName(d.projectName || "");
        setClient(d.client || { name: "", email: "", address: "" });
        setCurrency(d.currency || "NGN");
        setIssueDate(d.issueDate || new Date().toISOString().slice(0, 10));
        setValidUntil(d.validUntil || "");
        setTaxRate(d.taxRate || "0");
        setDiscount(d.discount || "0");
        setNotes(d.notes || "");
        setEstimateNote(d.estimateNote || DEFAULT_QUOTATION_ESTIMATE_NOTE);
        setRevisionsNote(d.revisionsNote || DEFAULT_REVISIONS_NOTE);
        setWorkingHours(d.workingHours || DEFAULT_WORKING_HOURS);
        setDeliveryPeriod(d.deliveryPeriod || QUOTATION_DELIVERY_PERIODS[0]);
        setRows(d.rows || [{ name: "", description: "", quantity: "1", unit_price: "0", isNew: false }]);
        setSamples(d.samples || []);
        if (d.draftId) setDraftId(d.draftId);
      } catch (e) {
        console.error("Failed to restore quotation draft", e);
      }
    }
  }, [editDraftId]);

  useEffect(() => {
    if (hydrating) return;
    const state = {
      scope, projectId, milestoneId, periodMonth, projectName, client, currency,
      issueDate, validUntil, taxRate, discount, notes, estimateNote,
      revisionsNote, workingHours, deliveryPeriod, rows, samples, draftId,
    };
    localStorage.setItem("pending_quotation", JSON.stringify(state));

    const timeout = setTimeout(async () => {
      if (!projectName.trim() || !client.name || rows.length === 0 || rows.every((r) => !r.name)) return;
      const payload = buildPayload("draft");
      try {
        const url = draftId ? `/api/admin/finance/quotations/${draftId}` : "/api/admin/finance/quotations";
        const method = draftId ? "PATCH" : "POST";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const d = await res.json();
          if (!draftId && d.quotation?.id) setDraftId(d.quotation.id);
          setLastSaved(new Date());
        }
      } catch (e) {
        console.error("Quotation auto-save failed", e);
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [
    hydrating,
    scope, projectId, milestoneId, periodMonth, projectName, client, currency,
    issueDate, validUntil, taxRate, discount, notes, estimateNote,
    revisionsNote, workingHours, deliveryPeriod, rows, samples, draftId,
  ]);

  useEffect(() => {
    if (hydrating) return;
    if (scope === "milestone" && milestoneId) {
      const m = milestones.find((x) => x.id === milestoneId);
      if (m) setRows([{ name: m.description, description: "", quantity: "1", unit_price: String(m.budget), isNew: false }]);
    }
  }, [hydrating, milestoneId, scope, milestones]);

  const updateRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addRow = () => setRows((rs) => [...rs, { name: "", description: "", quantity: "1", unit_price: "0", isNew: true }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const pickPriceItem = (i: number, name: string) => {
    const found = priceItems.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (found) updateRow(i, { name: found.name, description: found.description ?? "", unit_price: String(found.unit_price), isNew: false });
    else updateRow(i, { name, isNew: true });
  };

  const subtotal = rows.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unit_price || 0), 0);
  const taxAmt = (subtotal - Number(discount || 0)) * (Number(taxRate || 0) / 100);
  const total = subtotal - Number(discount || 0) + taxAmt;

  const buildPayload = (status: "draft" | "sent") => ({
    project_id: projectId || null,
    milestone_id: milestoneId || null,
    project_name: projectName.trim(),
    client_name: client.name.trim(),
    client_email: client.email,
    client_address: client.address,
    currency,
    tax_rate: Number(taxRate),
    discount: Number(discount),
    scope,
    period_month: scope === "monthly" ? periodMonth : null,
    issue_date: issueDate,
    valid_until: validUntil || null,
    notes,
    estimate_note: estimateNote,
    revisions_note: revisionsNote,
    working_hours: workingHours,
    delivery_period: deliveryPeriod,
    status,
    items: rows.filter((r) => r.name.trim()).map((r) => ({
      name: r.name.trim(),
      description: r.description,
      quantity: Number(r.quantity) || 0,
      unit_price: Number(r.unit_price) || 0,
      isNew: r.isNew,
    })),
    samples: samples.map((sample, position) => ({ ...sample, position })),
  });

  const uploadSample = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "finance/quotation-samples");
      const r = await fetch("/api/admin/finance/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) {
        appAlert(d?.error || "Couldn't upload sample picture.");
        return;
      }
      setSamples((s) => [...s, { kind: "image", url: d.url, label: file.name.replace(/\.[^.]+$/, "") }]);
    } finally {
      setUploading(false);
    }
  };

  const addSampleLink = () => {
    const url = sampleForm.url.trim();
    if (!url) { appAlert("Paste a sample URL first."); return; }
    setSamples((s) => [...s, { kind: sampleForm.kind, url, label: sampleForm.label.trim() }]);
    setSampleForm({ kind: "image", url: "", label: "" });
  };

  const removeSample = (idx: number) => setSamples((s) => s.filter((_, i) => i !== idx));

  const save = async () => {
    const payload = buildPayload("sent");
    if (!payload.project_name) { appAlert("Project/company name is required."); return; }
    if (!payload.client_name) { appAlert("Client name is required."); return; }
    if (payload.items.length === 0) { appAlert("Add at least one item with a name."); return; }
    if (!payload.delivery_period) { appAlert("Select a delivery period range."); return; }

    setSaving(true);
    const url = draftId ? `/api/admin/finance/quotations/${draftId}` : "/api/admin/finance/quotations";
    const method = draftId ? "PATCH" : "POST";
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSaving(false);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        appAlert(d?.error || `Create failed (${r.status})`);
        return;
      }
      const d = await r.json();
      localStorage.removeItem("pending_quotation");
      const targetId = d?.quotation?.id || draftId;
      if (!targetId) {
        appAlert("Quotation created but no id was returned.");
        return;
      }
      router.push(`/admin/finance/quotations/${targetId}`);
    } catch (e) {
      setSaving(false);
      appAlert(e instanceof Error ? e.message : "Network error");
    }
  };

  return (
    <FinanceShell
      title="New Quotation"
      back={{ href: "/admin/finance/quotations", label: "Quotations" }}
      actions={
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Status</p>
            <div className="flex items-center gap-1.5 justify-end">
              <div className={`w-1.5 h-1.5 rounded-full ${isOffline ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
              <p className="text-xs font-semibold text-gray-600">
                {isOffline ? "Offline" : lastSaved ? `Saved ${lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Auto-saving..."}
              </p>
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="h-11 px-6 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">
            {saving ? "Creating..." : "Create Quotation"}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                  <Select value={projectId} onValueChange={(value) => {
                    setProjectId(value);
                    const p = projects.find((project) => project.id === value);
                    if (p) {
                      setProjectName(p.name);
                      setClient((c) => ({ ...c, name: c.name || p.client }));
                      setCurrency(p.currency);
                    }
                  }}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} - {p.client}</SelectItem>)}</SelectContent>
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
            <h3 className="font-semibold text-gray-900 mb-4">Quotation Metadata</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Project / Company Name">
                <Input className="h-11 rounded-xl" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Citywave brand rollout" />
              </Field>
              <Field label="Delivery Period Range">
                <Select value={deliveryPeriod} onValueChange={setDeliveryPeriod}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{QUOTATION_DELIVERY_PERIODS.map((period) => <SelectItem key={period} value={period}>{period}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          <div className={`${glassCard} p-6`}>
            <h3 className="font-semibold text-gray-900 mb-4">Prepared For</h3>
            <div className="space-y-4">
              <Field label="Client Name">
                <div className="relative">
                  <Input
                    className="h-11 rounded-xl"
                    placeholder="Type to search existing clients, or enter a new name"
                    value={client.name}
                    onChange={(e) => {
                      setClient({ ...client, name: e.target.value });
                      setClientQuery(e.target.value);
                      setClientMenuOpen(true);
                    }}
                    onFocus={() => setClientMenuOpen(true)}
                    onBlur={() => setTimeout(() => setClientMenuOpen(false), 150)}
                    autoComplete="off"
                  />
                  {clientMenuOpen && (clientMatches.length > 0 || clientQuery.trim().length > 0) && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-40 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
                      {clientMatches.map((c) => (
                        <button key={c.id} type="button" onMouseDown={(e) => { e.preventDefault(); applyClient(c); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 transition">
                          <div className="text-[13.5px] font-semibold text-[#0D1B39] truncate">
                            {c.name}
                            {c.brand_name && c.brand_name !== c.name ? <span className="text-[11.5px] font-normal text-gray-400"> - {c.brand_name}</span> : null}
                          </div>
                          <div className="text-[11.5px] text-gray-400 truncate">{[c.email, c.phone].filter(Boolean).join("  |  ") || (c.industry ?? "-")}</div>
                        </button>
                      ))}
                      {clientQuery.trim().length > 0 && !clientMatches.some((c) => c.name.toLowerCase() === clientQuery.trim().toLowerCase()) && (
                        <button type="button" disabled={creatingClient} onMouseDown={(e) => { e.preventDefault(); createNewClient(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-left border-t border-gray-100 bg-blue-50/40 hover:bg-blue-50 transition disabled:opacity-60">
                          <Plus className="w-3.5 h-3.5 text-[#0A4FE8]" />
                          <span className="text-[13px] text-[#0D1B39] font-medium truncate">{creatingClient ? "Saving..." : `Add "${clientQuery.trim()}" as a new client`}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Email"><Input className="h-11 rounded-xl" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} /></Field>
                <Field label="Address"><Input className="h-11 rounded-xl" value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} /></Field>
              </div>
            </div>
          </div>

          <div className={`${glassCard} p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Estimate Items</h3>
              <Button onClick={addRow} variant="outline" size="sm" className="rounded-xl"><Plus className="w-4 h-4 mr-1" /> Add Item</Button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Type a name to search the price list, or enter a new estimate item.</p>
            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="rounded-xl bg-white/60 border border-white/80 p-3">
                  <div className="flex flex-col md:flex-row md:items-start gap-2">
                    <div className="flex-1 min-w-0 md:basis-[40%]">
                      <input list={`pl-${i}`} value={r.name} onChange={(e) => pickPriceItem(i, e.target.value)} placeholder="Item name" className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white" />
                      <datalist id={`pl-${i}`}>
                        {priceItems.map((p) => <option key={p.id} value={p.name}>{formatMoney(p.unit_price, p.currency)}</option>)}
                      </datalist>
                      <div className="relative mt-2">
                        <input value={r.description} onChange={(e) => updateRow(i, { description: e.target.value })} placeholder="Description (optional)" className="w-full h-9 pl-3 pr-20 rounded-lg border border-gray-200 text-xs bg-white" />
                        <div className="absolute top-1/2 right-1 -translate-y-1/2">
                          <AIAssistButton
                            kind="invoice_item_description"
                            input={{ name: r.name, quantity: r.quantity, project: projectName }}
                            onAccept={(text) => updateRow(i, { description: text })}
                            label="AI"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 md:flex-none md:w-auto">
                      <input type="number" value={r.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} className="w-16 md:w-20 h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white shrink-0" placeholder="Qty" />
                      <input type="number" value={r.unit_price} onChange={(e) => updateRow(i, { unit_price: e.target.value })} className="w-24 md:w-28 h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white shrink-0" placeholder="Unit price" />
                      <div className="min-w-[110px] md:min-w-[130px] text-right text-sm font-semibold pt-2.5 whitespace-nowrap shrink-0 tabular-nums">{formatMoney(Number(r.quantity || 0) * Number(r.unit_price || 0), currency)}</div>
                      <button onClick={() => removeRow(i)} aria-label="Remove item" className="shrink-0 w-9 h-9 rounded-lg hover:bg-red-50 grid place-items-center text-gray-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${glassCard} p-6`}>
            <h3 className="font-semibold text-gray-900 mb-4">Sample References</h3>
            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-3 items-end">
              <Field label="Upload Picture">
                <label className="h-11 px-4 rounded-xl bg-white/80 border border-gray-200 hover:bg-white cursor-pointer inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Upload className="w-4 h-4" /> {uploading ? "Uploading..." : "Choose image"}
                  <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (file) uploadSample(file);
                  }} />
                </label>
              </Field>
              <Field label="Sample Link">
                <Input className="h-11 rounded-xl" value={sampleForm.url} onChange={(e) => setSampleForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://..." />
              </Field>
              <div className="flex gap-2">
                <Select value={sampleForm.kind} onValueChange={(value) => setSampleForm((f) => ({ ...f, kind: value as "image" | "link" }))}>
                  <SelectTrigger className="h-11 w-28 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="link">Link</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={addSampleLink}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>
            <Field label="Sample Label">
              <Input className="h-11 rounded-xl" value={sampleForm.label} onChange={(e) => setSampleForm((f) => ({ ...f, label: e.target.value }))} placeholder="Optional label for the sample link" />
            </Field>
            {samples.length > 0 && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {samples.map((sample, idx) => (
                  <div key={`${sample.url}-${idx}`} className="rounded-xl bg-white/70 border border-white/80 p-3 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-blue-50 grid place-items-center overflow-hidden shrink-0">
                      {sample.kind === "image" ? (
                        sample.url ? <img src={sample.url} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-blue-600" />
                      ) : (
                        <LinkIcon className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900 truncate">{sample.label || (sample.kind === "image" ? "Sample picture" : "Sample link")}</div>
                      <a href={sample.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 truncate block">{sample.url}</a>
                    </div>
                    <button onClick={() => removeSample(idx)} aria-label="Remove sample" className="w-8 h-8 rounded-lg hover:bg-red-50 grid place-items-center text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`${glassCard} p-6`}>
            <h3 className="font-semibold text-gray-900 mb-4">Notes & Estimate Terms</h3>
            <div className="space-y-4">
              <Field label="Rough Estimate Notice">
                <Textarea className="rounded-xl min-h-[80px]" value={estimateNote} onChange={(e) => setEstimateNote(e.target.value)} />
              </Field>
              <Field label="Notes">
                <Textarea className="rounded-xl min-h-[90px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <Field label="No. of Revisions / Policy">
                <Input className="h-11 rounded-xl" value={revisionsNote} onChange={(e) => setRevisionsNote(e.target.value)} />
              </Field>
              <Field label="Working Hours">
                <Input className="h-11 rounded-xl" value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} />
              </Field>
            </div>
          </div>
        </div>

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
                <Field label="Valid Until"><Input type="date" className="h-11 rounded-xl" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
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
              {Number(discount) > 0 && <div className="flex justify-between text-gray-600"><span>Discount</span><span>- {formatMoney(Number(discount), currency)}</span></div>}
              {Number(taxRate) > 0 && <div className="flex justify-between text-gray-600"><span>Tax ({taxRate}%)</span><span>{formatMoney(taxAmt, currency)}</span></div>}
              <div className="flex justify-between pt-3 border-t border-gray-200 text-lg font-bold"><span>Estimated Total</span><span>{formatMoney(total, currency)}</span></div>
            </div>
            <p className="text-[11px] text-gray-500 mt-4">This quotation stays outside the financial books until converted to an invoice.</p>
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
