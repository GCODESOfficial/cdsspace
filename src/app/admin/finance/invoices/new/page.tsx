'use client';

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import {
  CURRENCIES, CURRENCY_NAMES, Currency, FinancePriceItem, formatMoney,
  DELIVERY_SPEEDS, DeliverySpeed,
  DEFAULT_PAYMENT_TERMS, DEFAULT_REVISIONS_NOTE, DEFAULT_WORKING_HOURS,
} from "@/lib/finance/types";
import { Truck, Rocket, Zap, Clock as ClockIcon, Eye } from "lucide-react";
import DeliverySurchargeModal from "@/components/finance/DeliverySurchargeModal";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";
import { AIAssistButton } from "@/components/ai/AIAssistButton";
import Link from "next/link";
import { DraftRecoveryBanner, useDraftRecovery } from "@/lib/use-draft-recovery";

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
  contact_person?: string | null;
  billing_currency?: Currency | null;
}

export default function NewInvoicePage() {
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
  const [client, setClient] = useState({ name: "", email: "", address: "" });
  const [currency, setCurrency] = useState<Currency>("NGN");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([{ name: "", description: "", quantity: "1", unit_price: "0", isNew: false }]);
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const draft = useDraftRecovery<any>("invoice", { skip: !!editDraftId });
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveInFlightRef = useRef<Promise<string | null> | null>(null);

  // Client directory autocomplete
  const [clientMatches, setClientMatches] = useState<ClientLite[]>([]);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState("");

  // Payment terms + delivery
  const [paymentTerms, setPaymentTerms] = useState(DEFAULT_PAYMENT_TERMS);
  const [revisionsNote, setRevisionsNote] = useState(DEFAULT_REVISIONS_NOTE);
  const [workingHours, setWorkingHours] = useState(DEFAULT_WORKING_HOURS);
  const [deliverySpeed, setDeliverySpeed] = useState<DeliverySpeed>("standard");
  const [deliveryPeriod, setDeliveryPeriod] = useState("");
  const [pendingSpeed, setPendingSpeed] = useState<DeliverySpeed | null>(null);

  const pickDeliverySpeed = (value: DeliverySpeed) => {
    if (value === deliverySpeed) return;
    if (value === "standard") {
      setRows((rs) => rs.filter((r) => !r.name?.toLowerCase().includes("delivery surcharge")));
      setDeliverySpeed(value);
      return;
    }
    setPendingSpeed(value);
  };

  const applySurcharge = (amount: number, note: string) => {
    if (!pendingSpeed) return;
    setRows((rs) => {
      const cleaned = rs.filter((r) => !r.name?.toLowerCase().includes("delivery surcharge"));
      return [
        ...cleaned,
        { name: note, description: "", quantity: "1", unit_price: String(amount), isNew: false },
      ];
    });
    setDeliverySpeed(pendingSpeed);
    setPendingSpeed(null);
  };

  useEffect(() => {
    fetch("/api/admin/finance/projects").then((r) => r.json()).then((d) => setProjects(d.projects ?? []));
    fetch("/api/admin/finance/price-list").then((r) => r.json()).then((d) => setPriceItems(d.items ?? []));
  }, []);

  // Debounced lookup into the client/brand directory based on whatever the
  // admin is typing into the Client Name field.
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
    setClient({
      name: c.name,
      email: c.email ?? "",
      address: c.address ?? "",
    });
    if (CURRENCIES.includes(c.billing_currency as Currency)) setCurrency(c.billing_currency as Currency);
    setClientQuery("");
    setClientMenuOpen(false);
  };

  // Inline "Add new client" from the invoice form. Saves to the `clients`
  // admin directory and immediately fills in the Bill-To block.
  const [creatingClient, setCreatingClient] = useState(false);
  const createNewClient = async () => {
    const name = (clientQuery || client.name || "").trim();
    if (!name) { appAlert("Type a client name first."); return; }
    setCreatingClient(true);
    try {
      const r = await fetch("/api/admin/clients/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: client.email || null,
          address: client.address || null,
        }),
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
        setClient((c) => ({ ...c, name: c.name || d.project.client }));
      }
    });
  }, [projectId]);

  // Handle Offline state
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

  // Hydrate from an existing draft when arriving via ?draft={id} (e.g. the
  // "Generate Invoice" flow from brand briefs). This takes priority over the
  // localStorage recovery so a specific invoice is always the source of truth.
  useEffect(() => {
    if (!editDraftId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/finance/invoices/${editDraftId}`);
        if (!r.ok) {
          setHydrating(false);
          return;
        }
        const d = await r.json();
        if (cancelled || !d?.invoice) return;
        const inv = d.invoice;
        if (inv.status === "paid") {
          const role = await fetch("/api/admin-check", { cache: "no-store" })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => data?.role)
            .catch(() => null);
          if (cancelled) return;
          if (role !== "super_admin") {
            appAlert("This invoice is paid and locked. Only a super admin can edit it.");
            router.replace(`/admin/finance/invoices/${inv.id}`);
            return;
          }
        }
        // Wipe any stale LS draft so the autosave effect doesn't race us.
        draft.clear();
        setScope((inv.scope as typeof scope) || "custom");
        setProjectId(inv.project_id || "");
        setMilestoneId(inv.milestone_id || "");
        setPeriodMonth(inv.period_month || "");
        setClient({
          name: inv.client_name || "",
          email: inv.client_email || "",
          address: inv.client_address || "",
        });
        setCurrency((inv.currency as Currency) || "NGN");
        setIssueDate(inv.issue_date || new Date().toISOString().slice(0, 10));
        setDueDate(inv.due_date || "");
        setTaxRate(String(inv.tax_rate ?? "0"));
        setDiscount(String(inv.discount ?? "0"));
        setNotes(inv.notes || "");
        setPaymentTerms(inv.payment_terms || DEFAULT_PAYMENT_TERMS);
        setRevisionsNote(inv.revisions_note || DEFAULT_REVISIONS_NOTE);
        setWorkingHours(inv.working_hours || DEFAULT_WORKING_HOURS);
        setDeliverySpeed((inv.delivery_speed as DeliverySpeed) || "standard");
        setDeliveryPeriod(inv.delivery_period || "");
        const items = (d.items ?? []) as Array<{
          name: string;
          description: string | null;
          quantity: number;
          unit_price: number;
        }>;
        if (items.length) {
          setRows(
            items.map((it) => ({
              name: it.name ?? "",
              description: it.description ?? "",
              quantity: String(it.quantity ?? 1),
              unit_price: String(it.unit_price ?? 0),
              isNew: false,
            })),
          );
        }
        setDraftId(inv.id);
      } catch (e) {
        console.error("Failed to hydrate draft", e);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editDraftId]);

  // A new invoice always opens blank. Any autosaved work is offered through the
  // banner instead of being applied silently - restoring it automatically also
  // revived the previous invoice's draft id, so saving overwrote that record.
  const applyDraft = (d: any) => {
    setScope(d.scope || "custom");
    setProjectId(d.projectId || "");
    setMilestoneId(d.milestoneId || "");
    setPeriodMonth(d.periodMonth || "");
    setClient(d.client || { name: "", email: "", address: "" });
    setCurrency(d.currency || "NGN");
    setIssueDate(d.issueDate || new Date().toISOString().slice(0, 10));
    setDueDate(d.dueDate || "");
    setTaxRate(d.taxRate || "0");
    setDiscount(d.discount || "0");
    setNotes(d.notes || "");
    setRows(d.rows || [{ name: "", description: "", quantity: "1", unit_price: "0", isNew: false }]);
    setPaymentTerms(d.paymentTerms || DEFAULT_PAYMENT_TERMS);
    setRevisionsNote(d.revisionsNote || DEFAULT_REVISIONS_NOTE);
    setWorkingHours(d.workingHours || DEFAULT_WORKING_HOURS);
    setDeliverySpeed(d.deliverySpeed || "standard");
    setDeliveryPeriod(d.deliveryPeriod || "");
    if (d.draftId) setDraftId(d.draftId);
  };

  // Auto-save Persistence
  useEffect(() => {
    if (hydrating || saving) return;
    const state = {
      scope, projectId, milestoneId, periodMonth, client, currency,
      issueDate, dueDate, taxRate, discount, notes, rows,
      paymentTerms, revisionsNote, workingHours, deliverySpeed, deliveryPeriod,
      draftId,
    };
    draft.save(state);

    const timeout = setTimeout(() => {
      if (!client.name || rows.length === 0 || rows.every(r => !r.name)) return;
      
      const payload = {
        project_id: projectId || null, milestone_id: milestoneId || null,
        client_name: client.name, client_email: client.email, client_address: client.address,
        currency, tax_rate: Number(taxRate), discount: Number(discount),
        scope, period_month: scope === "monthly" ? periodMonth : null,
        issue_date: issueDate, due_date: dueDate || null, notes,
        payment_terms: paymentTerms, revisions_note: revisionsNote, working_hours: workingHours,
        delivery_speed: deliverySpeed, delivery_period: deliveryPeriod.trim() || null,
        // Only a new record starts as a draft. Re-sending it on an existing
        // invoice would demote a sent or paid invoice back to draft.
        ...(draftId ? {} : { status: "draft" }),
        items: rows.filter(r => r.name.trim()).map((r) => ({
          name: r.name, description: r.description, quantity: Number(r.quantity), unit_price: Number(r.unit_price), isNew: r.isNew,
        })),
      };

      const operation = (async () => {
        try {
          const url = draftId ? `/api/admin/finance/invoices/${draftId}` : "/api/admin/finance/invoices";
          const method = draftId ? "PATCH" : "POST";
          const res = await fetch(url, {
            method, headers: { "Content-Type": "application/json", "x-cds-silent": "1" },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            const d = await res.json();
            const savedDraftId = String(d.invoice?.id || draftId || "") || null;
            if (!draftId && savedDraftId) setDraftId(savedDraftId);
            setLastSaved(new Date());
            return savedDraftId;
          }
        } catch (e) {
          console.error("Auto-save failed", e);
        }
        return null;
      })();
      autosaveInFlightRef.current = operation;
      void operation.finally(() => {
        if (autosaveInFlightRef.current === operation) autosaveInFlightRef.current = null;
      });
    }, 3000);
    autosaveTimerRef.current = timeout;

    return () => {
      clearTimeout(timeout);
      if (autosaveTimerRef.current === timeout) autosaveTimerRef.current = null;
    };
  }, [
    hydrating,
    scope, projectId, milestoneId, periodMonth, client, currency,
    issueDate, dueDate, taxRate, discount, notes, rows,
    paymentTerms, revisionsNote, workingHours, deliverySpeed, deliveryPeriod,
    draftId, saving
  ]);

  // Auto-fill from milestone
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
    const cleanItems = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        description: r.description,
        quantity: Number(r.quantity) || 0,
        unit_price: Number(r.unit_price) || 0,
        isNew: r.isNew,
      }));

    if (!client.name.trim()) { appAlert("Client name is required."); return; }
    if (cleanItems.length === 0) { appAlert("Add at least one item with a name."); return; }
    if (total <= 0) { appAlert("Add a positive invoice amount before saving."); return; }

    setSaving(true);
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    let savedDraftId = draftId;
    if (autosaveInFlightRef.current) {
      savedDraftId = savedDraftId || await autosaveInFlightRef.current;
    }
    const payload = {
      project_id: projectId || null, milestone_id: milestoneId || null,
      client_name: client.name.trim(), client_email: client.email, client_address: client.address,
      currency, tax_rate: Number(taxRate), discount: Number(discount),
      scope, period_month: scope === "monthly" ? periodMonth : null,
      issue_date: issueDate, due_date: dueDate || null, notes,
      payment_terms: paymentTerms,
      revisions_note: revisionsNote,
      working_hours: workingHours,
      delivery_speed: deliverySpeed,
      delivery_period: deliveryPeriod.trim() || null,
      // Saving completes the invoice record; delivery is a separate, explicit
      // action from the invoice page. The share endpoint marks it sent only
      // after the email provider accepts the completed invoice.
      ...(savedDraftId ? {} : { status: "draft" }),
      finalize: true,
      items: cleanItems,
    };

    const url = savedDraftId ? `/api/admin/finance/invoices/${savedDraftId}` : "/api/admin/finance/invoices";
    const method = savedDraftId ? "PATCH" : "POST";

    try {
      const r = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSaving(false);

      if (!r.ok) {
        let message = `Create failed (${r.status})`;
        try {
          const d = await r.json();
          if (d?.error) message = d.error;
        } catch {}
        // If we were PATCHing a stale draft that no longer exists, retry as fresh POST.
        if (r.status === 404 && savedDraftId) {
          setDraftId(null);
          const retry = await fetch("/api/admin/finance/invoices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (retry.ok) {
            const d = await retry.json();
            draft.clear();
            router.push(`/admin/finance/invoices/${d.invoice.id}`);
            return;
          }
        }
        appAlert(message);
        return;
      }

      const d = await r.json();
      draft.clear();
      const targetId = d?.invoice?.id || savedDraftId;
      if (!targetId) {
        appAlert("Invoice created but no id was returned.");
        return;
      }
      router.push(`/admin/finance/invoices/${targetId}`);
    } catch (e) {
      setSaving(false);
      appAlert(e instanceof Error ? e.message : "Network error");
    }
  };

  return (
    <FinanceShell
      title="New invoice"
      back={{ href: "/admin/finance/invoices", label: "Invoices" }}
      actions={
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Status</p>
            <div className="flex items-center gap-1.5 justify-end">
              <div className={`w-1.5 h-1.5 rounded-full ${isOffline ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
              <p className="text-xs font-semibold text-gray-600">
                {isOffline ? "Offline" : lastSaved ? `Saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : "Auto-saving..."}
              </p>
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="h-11 px-6 rounded-xl bg-[#0A4FE8] shadow-lg shadow-blue-600/30">
            {saving ? "Saving…" : "Save invoice"}
          </Button>
        </div>
      }
    >
      <DraftRecoveryBanner draft={draft} label="invoice" onRestore={applyDraft} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: details + items */}
        <div className="lg:col-span-2 space-y-6">
          <div className={`${glassCard} p-6`}>
            <h3 className="font-semibold text-gray-900 mb-4">Scope</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(["custom", "project", "milestone", "monthly"] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)} className={`py-2.5 rounded-xl text-sm font-medium capitalize transition ${scope === s ? "bg-[#0A4FE8] text-white shadow-lg shadow-blue-600/30" : "bg-white/70 text-gray-600 hover:bg-white"}`}>{s}</button>
              ))}
            </div>
            {scope !== "custom" && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Project">
                  <Select value={projectId} onValueChange={setProjectId}>
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
            <h3 className="font-semibold text-gray-900 mb-4">Bill To</h3>
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
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); applyClient(c); }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 transition"
                        >
                          <div className="text-[13.5px] font-semibold text-[#0D1B39] truncate">
                            {c.name}
                            {c.brand_name && c.brand_name !== c.name ? (
                              <span className="text-[11.5px] font-normal text-gray-400"> · {c.brand_name}</span>
                            ) : null}
                          </div>
                          <div className="text-[11.5px] text-gray-400 truncate">
                            {[c.email, c.phone].filter(Boolean).join("  •  ") || (c.industry ?? "-")}
                          </div>
                        </button>
                      ))}
                      {clientQuery.trim().length > 0 &&
                        !clientMatches.some((c) => c.name.toLowerCase() === clientQuery.trim().toLowerCase()) && (
                        <button
                          type="button"
                          disabled={creatingClient}
                          onMouseDown={(e) => { e.preventDefault(); createNewClient(); }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left border-t border-gray-100 bg-blue-50/40 hover:bg-blue-50 transition disabled:opacity-60"
                        >
                          <Plus className="w-3.5 h-3.5 text-[#0A4FE8]" />
                          <span className="text-[13px] text-[#0D1B39] font-medium truncate">
                            {creatingClient ? "Saving…" : `Add “${clientQuery.trim()}” as a new client`}
                          </span>
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
              <h3 className="font-semibold text-gray-900">Items</h3>
              <Button onClick={addRow} variant="outline" size="sm" className="rounded-xl"><Plus className="w-4 h-4 mr-1" /> Add Item</Button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Type a name to search the price list, or enter a new item - new items are auto-saved to your price list.</p>
            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="rounded-xl bg-white/60 border border-white/80 p-3">
                  <div className="flex flex-col md:flex-row md:items-start gap-2">
                    {/* Name + description */}
                    <div className="flex-1 min-w-0 md:basis-[40%]">
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
                      <div className="relative mt-2">
                        <input value={r.description} onChange={(e) => updateRow(i, { description: e.target.value })} placeholder="Description (optional)" className="w-full h-9 pl-3 pr-20 rounded-lg border border-gray-200 text-xs bg-white" />
                        <div className="absolute top-1/2 right-1 -translate-y-1/2">
                          <AIAssistButton
                            kind="invoice_item_description"
                            input={{
                              name: r.name,
                              quantity: r.quantity,
                              project: projects.find((p) => p.id === projectId)?.name,
                            }}
                            onAccept={(text) => updateRow(i, { description: text })}
                            label="AI"
                          />
                        </div>
                      </div>
                    </div>
                    {/* Qty / unit / amount / delete - wraps on mobile, stays tight on desktop */}
                    <div className="flex items-start gap-2 md:flex-none md:w-auto">
                      <input
                        type="number"
                        value={r.quantity}
                        onChange={(e) => updateRow(i, { quantity: e.target.value })}
                        className="w-16 md:w-20 h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white shrink-0"
                        placeholder="Qty"
                      />
                      <input
                        type="number"
                        value={r.unit_price}
                        onChange={(e) => updateRow(i, { unit_price: e.target.value })}
                        className="w-24 md:w-28 h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white shrink-0"
                        placeholder="Unit price"
                      />
                      <div className="min-w-[110px] md:min-w-[130px] text-right text-sm font-semibold pt-2.5 whitespace-nowrap shrink-0 tabular-nums">
                        {formatMoney(Number(r.quantity || 0) * Number(r.unit_price || 0), currency)}
                      </div>
                      <button
                        onClick={() => removeRow(i)}
                        aria-label="Remove item"
                        className="shrink-0 w-9 h-9 rounded-lg hover:bg-red-50 grid place-items-center text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${glassCard} p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Notes</h3>
              <AIAssistButton
                kind="invoice_notes"
                input={{
                  client_name: client.name,
                  currency,
                  total: rows.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unit_price || 0), 0),
                  due_date: dueDate,
                  scope,
                  items: rows.filter((r) => r.name.trim()),
                  existing: notes,
                }}
                onAccept={setNotes}
                label="AI fill"
              />
            </div>
            <Textarea className="rounded-xl min-h-[90px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {/* Payment terms & delivery */}
          <div className={`${glassCard} p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Payment Terms & Delivery</h3>
              <button
                type="button"
                onClick={() => {
                  setPaymentTerms(DEFAULT_PAYMENT_TERMS);
                  setRevisionsNote(DEFAULT_REVISIONS_NOTE);
                  setWorkingHours(DEFAULT_WORKING_HOURS);
                }}
                className="text-[11px] text-blue-600 hover:underline"
              >
                Reset to defaults
              </button>
            </div>

            <div className="space-y-4">
              <Field label="Payment Terms">
                <Input className="h-11 rounded-xl" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 100% Upfront Payment. Payment is not Refundable" />
              </Field>
              <Field label="No. of Revisions / Policy">
                <Input className="h-11 rounded-xl" value={revisionsNote} onChange={(e) => setRevisionsNote(e.target.value)} placeholder="e.g. Designs are subject to Free 2 Revisions" />
              </Field>
              <Field label="Working Hours">
                <Input className="h-11 rounded-xl" value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} placeholder="9am–5:30pm Monday–Friday  UTC+1" />
              </Field>

              <div>
                <Label className="text-xs uppercase tracking-wide text-gray-500">Delivery Speed</Label>
                <div className="mt-1.5 grid grid-cols-2 md:grid-cols-4 gap-2">
                  {DELIVERY_SPEEDS.map((s) => {
                    const Icon = s.value === "flash" ? Zap : s.value === "super_express" ? Rocket : s.value === "express" ? ClockIcon : Truck;
                    const active = deliverySpeed === s.value;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => pickDeliverySpeed(s.value)}
                        className={`p-3 rounded-xl text-left transition border ${
                          active
                            ? "bg-[#0A4FE8] text-white border-transparent shadow-lg shadow-blue-600/30"
                            : "bg-white/70 text-gray-700 border-white/80 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5" />
                          <span className="text-[12.5px] font-semibold">{s.label}</span>
                        </div>
                        <p className={`text-[10.5px] mt-0.5 ${active ? "text-white/80" : "text-gray-500"}`}>{s.helper}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Field label="Delivery Period (manual)">
                <Input
                  className="h-11 rounded-xl"
                  value={deliveryPeriod}
                  onChange={(e) => setDeliveryPeriod(e.target.value)}
                  placeholder="e.g. 3 Working Days"
                />
              </Field>
            </div>
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
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c} · {CURRENCY_NAMES[c]}</SelectItem>)}</SelectContent>
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

      {pendingSpeed && (
        <DeliverySurchargeModal
          speed={pendingSpeed}
          subtotal={subtotal}
          currency={currency}
          onCancel={() => setPendingSpeed(null)}
          onConfirm={({ amount, note }) => applySurcharge(amount, note)}
        />
      )}
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
