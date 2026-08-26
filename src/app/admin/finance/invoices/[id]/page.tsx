'use client';

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote, BellRing, Copy, Download, Trash2, ExternalLink, Truck, Rocket, Zap, Clock as ClockIcon, Check, Pencil, History, RotateCcw, Loader2, Mail } from "lucide-react";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import InvoiceDocument from "@/components/finance/InvoiceDocument";
import { DELIVERY_SPEEDS, formatMoney, type DeliverySpeed, type FinanceInvoice, type FinanceInvoiceItem, type FinanceReceipt, type InvoicePaymentSubmission } from "@/lib/finance/types";
import { buildInvoiceShareMessage } from "@/lib/finance/share";
import DeliverySurchargeModal from "@/components/finance/DeliverySurchargeModal";
import CreateProjectFromInvoiceModal, { type InvoiceForProject } from "@/components/finance/CreateProjectFromInvoiceModal";
import { appAlert, appConfirm, appToast, appPrompt } from "@/lib/app-notify";

interface VersionRow {
  id: string;
  action: string;
  actor_name: string;
  resource_label: string | null;
  created_at: string;
  before_data?: { invoice?: unknown };
  metadata: Record<string, unknown> | null;
}

interface PaymentReminderRow {
  id: string;
  sent_by: string;
  chat_sent_at: string | null;
  email_to: string | null;
  email_sent_at: string | null;
  email_error: string | null;
  created_at: string;
}

const VERSION_ACTION_LABELS: Record<string, string> = {
  "invoice.create": "Created invoice",
  "invoice.update": "Updated invoice",
  "invoice.send": "Marked as sent",
  "invoice.mark_paid": "Marked as paid",
  "invoice.surcharge": "Added delivery surcharge",
  "invoice.restore_version": "Restored version",
  "invoice.delete": "Deleted invoice",
};

function versionActionLabel(action: string) {
  return VERSION_ACTION_LABELS[action] ?? action.replace(/\./g, " ");
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [invoice, setInvoice] = useState<FinanceInvoice | null>(null);
  const [items, setItems] = useState<FinanceInvoiceItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [savedTerms, setSavedTerms] = useState(false);
  const [pendingSpeed, setPendingSpeed] = useState<DeliverySpeed | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [projectPrompt, setProjectPrompt] = useState<InvoiceForProject | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [emailing, setEmailing] = useState(false);
  const [bannerOrder, setBannerOrder] = useState<{ id: string; is_custom: boolean } | null>(null);
  const [paymentSubmissions, setPaymentSubmissions] = useState<InvoicePaymentSubmission[]>([]);
  const [receipt, setReceipt] = useState<FinanceReceipt | null>(null);
  const [reviewingPayment, setReviewingPayment] = useState<string | null>(null);
  const [paymentReminders, setPaymentReminders] = useState<PaymentReminderRow[]>([]);
  const [sendingReminder, setSendingReminder] = useState(false);

  const onSpeedClick = (value: DeliverySpeed) => {
    if (invoice?.delivery_speed === value) return;
    if (value === "standard") {
      patchInvoice({ delivery_speed: "standard" });
      return;
    }
    setPendingSpeed(value);
  };

  const confirmSurcharge = async ({ amount, note }: { amount: number; note: string }) => {
    if (!pendingSpeed) return;
    await fetch(`/api/admin/finance/invoices/${id}/surcharge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, note }),
    });
    await fetch(`/api/admin/finance/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delivery_speed: pendingSpeed }),
    });
    setPendingSpeed(null);
    load();
  };

  const load = async () => {
    setLoadError(null);
    try {
      const r = await fetch(`/api/admin/finance/invoices/${id}`);
      if (!r.ok) {
        let msg = `Couldn't load invoice (${r.status}).`;
        try {
          const d = await r.json();
          if (d?.error) msg = d.error;
        } catch {}
        setLoadError(msg);
        return;
      }
      const d = await r.json();
      if (!d?.invoice) {
        setLoadError("Invoice not found.");
        return;
      }
      setInvoice(d.invoice);
      setItems(d.items ?? []);
      setBannerOrder(d.bannerOrder ?? null);
      setPaymentSubmissions(d.paymentSubmissions ?? []);
      setPaymentReminders(d.paymentReminders ?? []);
      setReceipt(d.receipt ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Network error");
    }
  };
  useEffect(() => { load(); }, [id]);

  const loadVersions = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const r = await fetch(`/api/admin/finance/invoices/${id}/versions`, { cache: "no-store" });
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
    if (!(await appConfirm(`Restore the invoice to the version before "${versionActionLabel(version.action)}"?`))) return;
    setRestoringVersionId(version.id);
    try {
      const r = await fetch(`/api/admin/finance/invoices/${id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: version.id }),
      });
      const d = await r.json();
      if (!r.ok) {
        appAlert(d?.error || "Couldn't restore that version.");
        return;
      }
      setInvoice(d.invoice);
      setItems(d.items ?? []);
      await loadVersions();
      appAlert("Invoice restored.");
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Couldn't restore that version.");
    } finally {
      setRestoringVersionId(null);
    }
  };

  const updateStatus = async (status: string) => {
    await fetch(`/api/admin/finance/invoices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
    // Offer to create a project once it's settled (unless already linked).
    if (status === "paid" && invoice && !(invoice as { project_id?: string | null }).project_id) {
      setProjectPrompt(invoice as unknown as InvoiceForProject);
    }
  };

  const reviewPayment = async (submission: InvoicePaymentSubmission, action: "confirm" | "reject") => {
    if (action === "confirm" && !(await appConfirm(`Confirm ${formatMoney(submission.amount, submission.currency)} as received and mark this invoice paid?`))) return;
    if (action === "reject" && !(await appConfirm("Reject this transfer submission? The invoice will remain unpaid."))) return;
    setReviewingPayment(submission.id);
    try {
      const response = await fetch(`/api/admin/finance/invoices/${id}/payment/${submission.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Payment review failed.");
      await load();
      appToast({ message: action === "confirm" ? "Payment confirmed and receipt issued." : "Payment submission rejected.", kind: "success" });
    } catch (reason) {
      appAlert(reason instanceof Error ? reason.message : "Payment review failed.");
    } finally {
      setReviewingPayment(null);
    }
  };

  const patchInvoice = async (patch: Partial<FinanceInvoice>) => {
    setInvoice((prev) => (prev ? { ...prev, ...patch } : prev));
    await fetch(`/api/admin/finance/invoices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    setSavedTerms(true);
    setTimeout(() => setSavedTerms(false), 1500);
  };

  const remove = async () => {
    if (!(await appConfirm("Delete this invoice?"))) return;
    const r = await fetch(`/api/admin/finance/invoices/${id}`, { method: "DELETE" });
    if (r.ok) router.push("/admin/finance/invoices");
  };

  const publicUrl = invoice ? `${typeof window !== "undefined" ? window.location.origin : ""}/invoice/${invoice.public_token}` : "";
  const shareMessage = invoice ? buildInvoiceShareMessage(invoice.invoice_number, publicUrl) : publicUrl;

  const copyLink = () => {
    navigator.clipboard.writeText(shareMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sendViaEmail = async () => {
    if (!invoice) return;
    const to = await appPrompt({
      title: "Email invoice",
      message: `Send ${invoice.invoice_number} to:`,
      defaultValue: invoice.client_email || "",
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
        body: JSON.stringify({ kind: "invoice", id, to: to.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed to send");
      appToast({ message: `Invoice emailed to ${j.to}`, kind: "success" });
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Could not send the email");
    } finally {
      setEmailing(false);
    }
  };

  const sendPaymentReminder = async () => {
    if (!invoice) return;
    if (!(await appConfirm(`Send ${invoice.client_name} a payment reminder for ${invoice.invoice_number} by client chat and email?`))) return;
    setSendingReminder(true);
    try {
      const response = await fetch(`/api/admin/finance/invoices/${id}/reminder`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not send the payment reminder.");
      await load();
      const channels = [data.chat_sent ? "client chat" : null, data.email_sent ? "email" : null].filter(Boolean).join(" and ");
      appToast({ message: `Payment reminder sent by ${channels || "the available channel"}.`, kind: "success" });
      if (data.warning) appAlert(`The chat reminder was sent, but email delivery reported: ${data.warning}`);
    } catch (reason) {
      appAlert(reason instanceof Error ? reason.message : "Could not send the payment reminder.");
    } finally {
      setSendingReminder(false);
    }
  };

  if (loadError) {
    return (
      <FinanceShell title="Invoice" back={{ href: "/admin/finance/invoices", label: "Invoices" }}>
        <div className={`${glassCard} p-8`}>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Couldn't open this invoice</h3>
          <p className="text-gray-600 text-sm mb-4">{loadError}</p>
          <div className="flex gap-2">
            <Button onClick={load} className="h-10 px-4 rounded-xl">Retry</Button>
            <Button
              variant="outline"
              onClick={() => (router.push("/admin/finance/invoices"))}
              className="h-10 px-4 rounded-xl"
            >
              Back to invoices
            </Button>
          </div>
        </div>
      </FinanceShell>
    );
  }

  if (!invoice) {
    return <FinanceShell title="Loading…"><div className={`${glassCard} p-10 text-gray-500`}>Loading invoice…</div></FinanceShell>;
  }

  return (
    <FinanceShell
      title={invoice.invoice_number}
      subtitle={invoice.client_name}
      back={{ href: "/admin/finance/invoices", label: "Invoices" }}
      actions={
        <>
          {["sent", "overdue"].includes(invoice.status) && (
            <Button variant="outline" className="h-11 rounded-xl px-4" onClick={sendPaymentReminder} disabled={sendingReminder}>
              {sendingReminder ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <BellRing className="mr-1.5 h-4 w-4" />} Remind payment
            </Button>
          )}
          <Select value={invoice.status} onValueChange={updateStatus}>
            <SelectTrigger className="h-11 w-36 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={() => router.push(`/admin/finance/invoices/new?draft=${id}`)}>
            <Pencil className="w-4 h-4 mr-1.5" /> Edit
          </Button>
          <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={toggleHistory}>
            <History className="w-4 h-4 mr-1.5" /> History
          </Button>
          <Button
            variant="outline"
            className="h-11 px-4 rounded-xl"
            onClick={async () => { if (invoice) { const { exportInvoiceToPdf } = await import("@/lib/invoice-pdf"); exportInvoiceToPdf(invoice, items); } }}
          >
            <Download className="w-4 h-4 mr-1.5" /> PDF
          </Button>
          <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={remove}><Trash2 className="w-4 h-4 text-red-600" /></Button>
        </>
      }
    >
      <div className={`${glassCard} p-5 mb-6 flex items-center justify-between gap-4`}>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Public share link</div>
          <div className="text-sm font-mono text-gray-700 truncate">{publicUrl}</div>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" className="rounded-lg" onClick={sendViaEmail} disabled={emailing}>
            {emailing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}Email
          </Button>
          <Button variant="outline" size="sm" className="rounded-lg" onClick={copyLink}><Copy className="w-4 h-4 mr-1" />{copied ? "Copied" : "Copy"}</Button>
          <Link href={publicUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="rounded-lg"><ExternalLink className="w-4 h-4 mr-1" />Open</Button>
          </Link>
          <UniversalShareButton title={`Invoice ${invoice.invoice_number}`} text={shareMessage} url={publicUrl} className="min-h-10 rounded-lg px-3" />
        </div>
      </div>

      {paymentReminders.length > 0 && (
        <section id="payment-verification" className={`${glassCard} mb-6 scroll-mt-24 p-5`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-gray-900"><BellRing className="h-4 w-4 text-blue-600" />Payment reminders</h3>
              <p className="mt-1 text-xs text-gray-500">Every reminder is retained with its sender, delivery channels, date, and time.</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-700">{paymentReminders.length} sent</span>
          </div>
          <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white/70">
            {paymentReminders.slice(0, 5).map((reminder) => (
              <div key={reminder.id} className="flex flex-col gap-1 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                <div><span className="font-bold text-[#0D1B39]">{reminder.sent_by}</span><span className="text-gray-500"> · {new Date(reminder.created_at).toLocaleString()}</span></div>
                <div className="text-gray-500">{reminder.chat_sent_at ? "Chat sent" : "No client chat"} · {reminder.email_sent_at ? `Email sent to ${reminder.email_to}` : reminder.email_error ? "Email failed" : "No email"}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {historyOpen && (
        <div className={`${glassCard} p-5 mb-6`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">Edit History</h3>
              <p className="text-xs text-gray-500 mt-0.5">Shared activity for admins with invoice access.</p>
            </div>
            <Button variant="outline" size="sm" className="rounded-lg" onClick={loadVersions} disabled={historyLoading}>
              {historyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
          {historyLoading ? (
            <div className="py-8 flex justify-center text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : historyError ? (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{historyError}</p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white/60 rounded-xl px-4 py-4">No saved versions yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 rounded-xl overflow-hidden border border-white/70 bg-white/60">
              {versions.map((version) => {
                const canRestore = Boolean(version.before_data?.invoice);
                return (
                  <div key={version.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{versionActionLabel(version.action)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {version.actor_name || "System"} · {new Date(version.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg shrink-0"
                      disabled={!canRestore || restoringVersionId === version.id}
                      onClick={() => restoreVersion(version)}
                    >
                      {restoringVersionId === version.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : canRestore ? (
                        <>
                          <RotateCcw className="w-4 h-4 mr-1.5" /> Restore
                        </>
                      ) : (
                        "No restore"
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(paymentSubmissions.length > 0 || receipt) && (
        <section className={`${glassCard} mb-6 p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold text-gray-900"><Banknote className="h-4 w-4 text-blue-600" />Payment review</h3><p className="mt-1 text-xs text-gray-500">Only admins with payment confirmation clearance can approve a transfer and start linked work.</p></div>{receipt && <Link href={`/receipt/${receipt.public_token}`} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">Open receipt</Link>}</div>
          <div className="space-y-3">{paymentSubmissions.map((submission) => <div key={submission.id} className="rounded-2xl border border-slate-100 bg-white/80 p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${submission.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : submission.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{submission.status}</span><span className="text-sm font-black text-[#0D1B39]">{formatMoney(submission.amount, submission.currency)}</span></div><p className="mt-2 text-xs text-slate-500">Submitted {new Date(submission.submitted_at).toLocaleString()}{submission.transfer_reference ? ` · Ref: ${submission.transfer_reference}` : ""}</p>{submission.proof_file_name && <p className="mt-1 text-[11px] font-semibold text-slate-600">Proof: {submission.proof_file_name}</p>}</div><div className="flex shrink-0 flex-wrap gap-2">{submission.proof_url && <a href={submission.proof_url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-blue-100 px-3 text-[11px] font-bold text-blue-700">View proof</a>}{submission.status === "pending" && <><button onClick={() => reviewPayment(submission, "reject")} disabled={reviewingPayment === submission.id} className="h-9 rounded-lg border border-red-100 px-3 text-[11px] font-bold text-red-600">Reject</button><button onClick={() => reviewPayment(submission, "confirm")} disabled={reviewingPayment === submission.id} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-[11px] font-bold text-white disabled:opacity-60">{reviewingPayment === submission.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Confirm payment</button></>}</div></div></div>)}</div>
        </section>
      )}

      {/* Payment terms & delivery editor */}
      <div className={`${glassCard} p-5 mb-6`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Payment Terms & Delivery</h3>
          {savedTerms && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><Check className="w-3 h-3" /> Saved</span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-gray-500">Payment Terms</Label>
            <Input
              className="h-11 rounded-xl mt-1.5"
              defaultValue={invoice.payment_terms || ""}
              onBlur={(e) => patchInvoice({ payment_terms: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-gray-500">No. of Revisions</Label>
            <Input
              className="h-11 rounded-xl mt-1.5"
              defaultValue={invoice.revisions_note || ""}
              onBlur={(e) => patchInvoice({ revisions_note: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[11px] uppercase tracking-wide text-gray-500">Working Hours</Label>
            <Input
              className="h-11 rounded-xl mt-1.5"
              defaultValue={invoice.working_hours || ""}
              onBlur={(e) => patchInvoice({ working_hours: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[11px] uppercase tracking-wide text-gray-500">Delivery Speed</Label>
            <div className="mt-1.5 grid grid-cols-2 md:grid-cols-4 gap-2">
              {DELIVERY_SPEEDS.map((s) => {
                const Icon = s.value === "flash" ? Zap : s.value === "super_express" ? Rocket : s.value === "express" ? ClockIcon : Truck;
                const active = (invoice.delivery_speed || "standard") === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => onSpeedClick(s.value as DeliverySpeed)}
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
          <div className="md:col-span-2">
            <Label className="text-[11px] uppercase tracking-wide text-gray-500">{bannerOrder && !bannerOrder.is_custom ? "Production Period (fixed)" : "Delivery Period (manual)"}</Label>
            <Input
              className="h-11 rounded-xl mt-1.5"
              defaultValue={invoice.delivery_period || ""}
              placeholder="e.g. 3 Working Days"
              disabled={Boolean(bannerOrder && !bannerOrder.is_custom)}
              onBlur={(e) => patchInvoice({ delivery_period: e.target.value })}
            />
            {bannerOrder && !bannerOrder.is_custom && <p className="mt-1.5 text-[11px] text-gray-500">Standard banners are fixed at 3 business days. Custom banner quotations remain editable.</p>}
          </div>
        </div>
      </div>

      <InvoiceDocument invoice={invoice} items={items} />

      {pendingSpeed && (
        <DeliverySurchargeModal
          speed={pendingSpeed}
          subtotal={Number(invoice.subtotal || 0)}
          currency={invoice.currency}
          onCancel={() => setPendingSpeed(null)}
          onConfirm={confirmSurcharge}
        />
      )}

      {projectPrompt && (
        <CreateProjectFromInvoiceModal
          invoice={projectPrompt}
          onClose={() => setProjectPrompt(null)}
          onCreated={() => { setProjectPrompt(null); load(); appAlert("Project created from invoice."); }}
        />
      )}

    </FinanceShell>
  );
}
