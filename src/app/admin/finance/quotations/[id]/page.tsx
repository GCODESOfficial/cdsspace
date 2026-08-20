'use client';

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Download, ExternalLink, FileText, History, Loader2, Pencil, RotateCcw, Trash2, Check, Mail } from "lucide-react";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import QuotationDocument from "@/components/finance/QuotationDocument";
import { QUOTATION_DELIVERY_PERIODS, type FinanceQuotation, type FinanceQuotationItem, type FinanceQuotationSample } from "@/lib/finance/types";
import { buildQuotationShareMessage } from "@/lib/finance/share";
import { appAlert, appConfirm, appToast, appPrompt } from "@/lib/app-notify";

interface VersionRow {
  id: string;
  action: string;
  actor_name: string;
  resource_label: string | null;
  created_at: string;
  before_data?: { quotation?: unknown };
  metadata: Record<string, unknown> | null;
}

const VERSION_ACTION_LABELS: Record<string, string> = {
  "quotation.create": "Created quotation",
  "quotation.update": "Updated quotation",
  "quotation.send": "Marked as sent",
  "quotation.accept": "Marked as accepted",
  "quotation.convert": "Converted to invoice",
  "quotation.restore_version": "Restored version",
  "quotation.delete": "Deleted quotation",
};

function versionActionLabel(action: string) {
  return VERSION_ACTION_LABELS[action] ?? action.replace(/\./g, " ");
}

export default function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [quotation, setQuotation] = useState<FinanceQuotation | null>(null);
  const [items, setItems] = useState<FinanceQuotationItem[]>([]);
  const [samples, setSamples] = useState<FinanceQuotationSample[]>([]);
  const [copied, setCopied] = useState(false);
  const [savedTerms, setSavedTerms] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const load = async () => {
    setLoadError(null);
    try {
      const r = await fetch(`/api/admin/finance/quotations/${id}`);
      if (!r.ok) {
        let msg = `Couldn't load quotation (${r.status}).`;
        try {
          const d = await r.json();
          if (d?.error) msg = d.error;
        } catch {}
        setLoadError(msg);
        return;
      }
      const d = await r.json();
      if (!d?.quotation) {
        setLoadError("Quotation not found.");
        return;
      }
      setQuotation(d.quotation);
      setItems(d.items ?? []);
      setSamples(d.samples ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Network error");
    }
  };

  useEffect(() => { load(); }, [id]);

  const loadVersions = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const r = await fetch(`/api/admin/finance/quotations/${id}/versions`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) {
        setHistoryError(d?.error || "Couldn't load edit history.");
        setVersions([]);
        return;
      }
      setVersions(Array.isArray(d.versions) ? d.versions : []);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Couldn't load edit history.");
      setVersions([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleHistory = () => {
    setHistoryOpen((open) => {
      const next = !open;
      if (next && versions.length === 0 && !historyLoading) void loadVersions();
      return next;
    });
  };

  const restoreVersion = async (version: VersionRow) => {
    if (!(await appConfirm(`Restore the quotation to the version before "${versionActionLabel(version.action)}"?`))) return;
    setRestoringVersionId(version.id);
    try {
      const r = await fetch(`/api/admin/finance/quotations/${id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: version.id }),
      });
      const d = await r.json();
      if (!r.ok) {
        appAlert(d?.error || "Couldn't restore that version.");
        return;
      }
      setQuotation(d.quotation);
      setItems(d.items ?? []);
      setSamples(d.samples ?? []);
      await loadVersions();
      appAlert("Quotation restored.");
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Couldn't restore that version.");
    } finally {
      setRestoringVersionId(null);
    }
  };

  const updateStatus = async (status: string) => {
    const r = await fetch(`/api/admin/finance/quotations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      appAlert(d?.error || "Couldn't update status.");
      return;
    }
    load();
  };

  const patchQuotation = async (patch: Partial<FinanceQuotation>) => {
    setQuotation((prev) => (prev ? { ...prev, ...patch } : prev));
    await fetch(`/api/admin/finance/quotations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSavedTerms(true);
    setTimeout(() => setSavedTerms(false), 1500);
  };

  const remove = async () => {
    if (!(await appConfirm("Delete this quotation?"))) return;
    const r = await fetch(`/api/admin/finance/quotations/${id}`, { method: "DELETE" });
    if (r.ok) window.location.href = "/admin/finance/quotations";
  };

  const convertToInvoice = async () => {
    if (!quotation) return;
    if (quotation.converted_invoice_id) {
      window.location.href = `/admin/finance/invoices/${quotation.converted_invoice_id}`;
      return;
    }
    const conversionTarget = quotation.user_id ? "a priced invoice and send it to the client" : "a draft invoice";
    if (!(await appConfirm(`Convert ${quotation.quotation_number} to ${conversionTarget}?`))) return;
    setConverting(true);
    try {
      const r = await fetch(`/api/admin/finance/quotations/${id}/convert`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        appAlert(d?.error || "Couldn't convert quotation.");
        return;
      }
      window.location.href = `/admin/finance/invoices/${d.invoice.id}`;
    } finally {
      setConverting(false);
    }
  };

  if (loadError) {
    return (
      <FinanceShell title="Quotation" back={{ href: "/admin/finance/quotations", label: "Quotations" }}>
        <div className={`${glassCard} p-8`}>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Couldn't open this quotation</h3>
          <p className="text-gray-600 text-sm mb-4">{loadError}</p>
          <div className="flex gap-2">
            <Button onClick={load} className="h-10 px-4 rounded-xl">Retry</Button>
            <Button variant="outline" onClick={() => (window.location.href = "/admin/finance/quotations")} className="h-10 px-4 rounded-xl">Back to quotations</Button>
          </div>
        </div>
      </FinanceShell>
    );
  }

  if (!quotation) {
    return <FinanceShell title="Loading..."><div className={`${glassCard} p-10 text-gray-500`}>Loading quotation...</div></FinanceShell>;
  }

  const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/quotation/${quotation.public_token}`;
  const shareMessage = buildQuotationShareMessage(quotation.quotation_number, publicUrl);

  const copyLink = () => {
    navigator.clipboard.writeText(shareMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sendViaEmail = async () => {
    const to = await appPrompt({
      title: "Email quotation",
      message: `Send ${quotation.quotation_number} to:`,
      defaultValue: quotation.client_email || "",
      placeholder: "client@email.com",
      inputType: "email",
      confirmLabel: "Send",
    });
    if (!to || !to.trim()) return;
    setEmailing(true);
    try {
      const r = await fetch("/api/admin/finance/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "quotation", id, to: to.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed to send");
      appToast({ message: `Quotation emailed to ${j.to}`, kind: "success" });
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Could not send the email");
    } finally {
      setEmailing(false);
    }
  };

  return (
    <FinanceShell
      title={quotation.quotation_number}
      subtitle={`${quotation.project_name} - ${quotation.client_name}`}
      back={{ href: "/admin/finance/quotations", label: "Quotations" }}
      actions={
        <>
          <Select value={quotation.status} onValueChange={updateStatus}>
            <SelectTrigger className="h-11 w-40 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={() => window.location.href = `/admin/finance/quotations/new?draft=${id}`}>
            <Pencil className="w-4 h-4 mr-1.5" /> Edit
          </Button>
          <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={toggleHistory}>
            <History className="w-4 h-4 mr-1.5" /> History
          </Button>
          <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={async () => { const { exportQuotationToPdf } = await import("@/lib/quotation-pdf"); exportQuotationToPdf(quotation, items, samples); }}>
            <Download className="w-4 h-4 mr-1.5" /> PDF
          </Button>
          <Button className="h-11 px-4 rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-700 shadow-lg shadow-emerald-600/20" disabled={converting} onClick={convertToInvoice}>
            {converting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileText className="w-4 h-4 mr-1.5" />}
            {quotation.converted_invoice_id ? "Open Invoice" : "Convert"}
          </Button>
          <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={remove}><Trash2 className="w-4 h-4 text-red-600" /></Button>
        </>
      }
    >
      <div className={`${glassCard} p-5 mb-6 flex items-center justify-between gap-4`}>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Public share link</div>
          <div className="text-sm font-mono text-gray-700 truncate">{publicUrl}</div>
          <div className="text-[11px] text-amber-700 mt-1">Rough estimate only. Not recorded in financial books until converted to invoice.</div>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" className="rounded-lg" onClick={sendViaEmail} disabled={emailing}>
            {emailing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}Email
          </Button>
          <Button variant="outline" size="sm" className="rounded-lg" onClick={copyLink}><Copy className="w-4 h-4 mr-1" />{copied ? "Copied" : "Copy"}</Button>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="rounded-lg"><ExternalLink className="w-4 h-4 mr-1" />Open</Button>
          </a>
          <UniversalShareButton title={`Quotation ${quotation.quotation_number}`} text={shareMessage} url={publicUrl} className="min-h-10 rounded-lg px-3" />
        </div>
      </div>

      {historyOpen && (
        <div className={`${glassCard} p-5 mb-6`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">Edit History</h3>
              <p className="text-xs text-gray-500 mt-0.5">Shared activity for admins with quotation access.</p>
            </div>
            <Button variant="outline" size="sm" className="rounded-lg" onClick={loadVersions} disabled={historyLoading}>
              {historyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
          {historyLoading ? (
            <div className="py-8 flex justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : historyError ? (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{historyError}</p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white/60 rounded-xl px-4 py-4">No saved versions yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 rounded-xl overflow-hidden border border-white/70 bg-white/60">
              {versions.map((version) => {
                const canRestore = Boolean(version.before_data?.quotation);
                return (
                  <div key={version.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{versionActionLabel(version.action)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{version.actor_name || "System"} - {new Date(version.created_at).toLocaleString()}</p>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-lg shrink-0" disabled={!canRestore || restoringVersionId === version.id} onClick={() => restoreVersion(version)}>
                      {restoringVersionId === version.id ? <Loader2 className="w-4 h-4 animate-spin" /> : canRestore ? <><RotateCcw className="w-4 h-4 mr-1.5" /> Restore</> : "No restore"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={`${glassCard} p-5 mb-6`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Estimate Metadata</h3>
          {savedTerms && <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><Check className="w-3 h-3" /> Saved</span>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-gray-500">Project / Company Name</Label>
            <Input className="h-11 rounded-xl mt-1.5" defaultValue={quotation.project_name || ""} onBlur={(e) => patchQuotation({ project_name: e.target.value })} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-gray-500">Delivery Period</Label>
            <Select value={quotation.delivery_period || ""} onValueChange={(value) => patchQuotation({ delivery_period: value })}>
              <SelectTrigger className="h-11 rounded-xl mt-1.5"><SelectValue placeholder="Select range" /></SelectTrigger>
              <SelectContent>{QUOTATION_DELIVERY_PERIODS.map((period) => <SelectItem key={period} value={period}>{period}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-[11px] uppercase tracking-wide text-gray-500">Rough Estimate Notice</Label>
            <Textarea className="rounded-xl mt-1.5 min-h-[80px]" defaultValue={quotation.estimate_note || ""} onBlur={(e) => patchQuotation({ estimate_note: e.target.value })} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-gray-500">No. of Revisions</Label>
            <Input className="h-11 rounded-xl mt-1.5" defaultValue={quotation.revisions_note || ""} onBlur={(e) => patchQuotation({ revisions_note: e.target.value })} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-gray-500">Working Hours</Label>
            <Input className="h-11 rounded-xl mt-1.5" defaultValue={quotation.working_hours || ""} onBlur={(e) => patchQuotation({ working_hours: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[11px] uppercase tracking-wide text-gray-500">Notes</Label>
            <Textarea className="rounded-xl mt-1.5 min-h-[80px]" defaultValue={quotation.notes || ""} onBlur={(e) => patchQuotation({ notes: e.target.value })} />
          </div>
        </div>
      </div>

      <QuotationDocument quotation={quotation} items={items} samples={samples} />

    </FinanceShell>
  );
}
