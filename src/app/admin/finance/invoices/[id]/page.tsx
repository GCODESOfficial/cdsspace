'use client';

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Download, Trash2, ExternalLink } from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import InvoiceDocument from "@/components/finance/InvoiceDocument";
import type { FinanceInvoice, FinanceInvoiceItem } from "@/lib/finance/types";

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [invoice, setInvoice] = useState<FinanceInvoice | null>(null);
  const [items, setItems] = useState<FinanceInvoiceItem[]>([]);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const r = await fetch(`/api/admin/finance/invoices/${id}`);
    const d = await r.json();
    setInvoice(d.invoice); setItems(d.items ?? []);
  };
  useEffect(() => { load(); }, [id]);

  const updateStatus = async (status: string) => {
    await fetch(`/api/admin/finance/invoices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  };

  const remove = async () => {
    if (!confirm("Delete this invoice?")) return;
    const r = await fetch(`/api/admin/finance/invoices/${id}`, { method: "DELETE" });
    if (r.ok) window.location.href = "/admin/finance/invoices";
  };

  const publicUrl = invoice ? `${typeof window !== "undefined" ? window.location.origin : ""}/invoice/${invoice.public_token}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
          <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={() => window.open(`/invoice/${invoice.public_token}?print=1`, "_blank")}>
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-lg" onClick={copyLink}><Copy className="w-4 h-4 mr-1" />{copied ? "Copied" : "Copy"}</Button>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="rounded-lg"><ExternalLink className="w-4 h-4 mr-1" />Open</Button>
          </a>
        </div>
      </div>

      <InvoiceDocument invoice={invoice} items={items} />
    </FinanceShell>
  );
}
