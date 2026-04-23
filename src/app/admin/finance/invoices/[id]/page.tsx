'use client';

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Download, Trash2, ExternalLink, Truck, Rocket, Zap, Clock as ClockIcon, Check, Share2, Pencil } from "lucide-react";
import { exportInvoiceToPdf } from "@/lib/invoice-pdf";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import InvoiceDocument from "@/components/finance/InvoiceDocument";
import { DELIVERY_SPEEDS, type DeliverySpeed, type FinanceInvoice, type FinanceInvoiceItem } from "@/lib/finance/types";
import DeliverySurchargeModal from "@/components/finance/DeliverySurchargeModal";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [invoice, setInvoice] = useState<FinanceInvoice | null>(null);
  const [items, setItems] = useState<FinanceInvoiceItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [savedTerms, setSavedTerms] = useState(false);
  const [pendingSpeed, setPendingSpeed] = useState<DeliverySpeed | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Network error");
    }
  };
  useEffect(() => { load(); }, [id]);

  const updateStatus = async (status: string) => {
    await fetch(`/api/admin/finance/invoices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
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
    if (r.ok) window.location.href = "/admin/finance/invoices";
  };

  const publicUrl = invoice ? `${typeof window !== "undefined" ? window.location.origin : ""}/invoice/${invoice.public_token}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
              onClick={() => (window.location.href = "/admin/finance/invoices")}
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
          <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={() => window.location.href = `/admin/finance/invoices/new?draft=${id}`}>
            <Pencil className="w-4 h-4 mr-1.5" /> Edit
          </Button>
          <Button
            variant="outline"
            className="h-11 px-4 rounded-xl"
            onClick={() => invoice && exportInvoiceToPdf(invoice, items)}
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
          <Button variant="outline" size="sm" className="rounded-lg" onClick={copyLink}><Copy className="w-4 h-4 mr-1" />{copied ? "Copied" : "Copy"}</Button>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="rounded-lg"><ExternalLink className="w-4 h-4 mr-1" />Open</Button>
          </a>
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => setShareOpen((s) => !s)}
            >
              <Share2 className="w-4 h-4 mr-1" /> Share
            </Button>
            {shareOpen && (
              <>
                {/* click-outside blocker */}
                <div className="fixed inset-0 z-40" onClick={() => setShareOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-2xl border border-gray-100 p-1.5 flex items-center gap-1">
                  {(() => {
                    const encodedUrl = encodeURIComponent(publicUrl);
                    const encodedText = encodeURIComponent(
                      `Invoice ${invoice?.invoice_number ?? ""} from CDS Space`
                    );
                    const targets = [
                      {
                        key: "whatsapp",
                        label: "WhatsApp",
                        color: "bg-[#25D366] hover:bg-[#1eb957]",
                        href: `https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}`,
                      },
                      {
                        key: "facebook",
                        label: "Facebook",
                        color: "bg-[#1877F2] hover:bg-[#0f66d8]",
                        href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
                      },
                      {
                        key: "x",
                        label: "X",
                        color: "bg-black hover:bg-neutral-800",
                        href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
                      },
                      {
                        key: "linkedin",
                        label: "LinkedIn",
                        color: "bg-[#0A66C2] hover:bg-[#0957a7]",
                        href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
                      },
                    ];
                    return targets.map((t) => (
                      <a
                        key={t.key}
                        href={t.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setShareOpen(false)}
                        className={`${t.color} text-white text-[11px] font-semibold px-3 py-1.5 rounded-full transition whitespace-nowrap`}
                      >
                        {t.label}
                      </a>
                    ));
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

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
                        ? "bg-gradient-to-b from-blue-600 to-blue-700 text-white border-transparent shadow-lg shadow-blue-600/30"
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
            <Label className="text-[11px] uppercase tracking-wide text-gray-500">Delivery Period (manual)</Label>
            <Input
              className="h-11 rounded-xl mt-1.5"
              defaultValue={invoice.delivery_period || ""}
              placeholder="e.g. 3 Working Days"
              onBlur={(e) => patchInvoice({ delivery_period: e.target.value })}
            />
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
    </FinanceShell>
  );
}
