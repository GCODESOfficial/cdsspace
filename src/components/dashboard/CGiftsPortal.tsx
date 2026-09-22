"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Gift, Loader2, MessageCircle, Package, ReceiptText, Send } from "lucide-react";
import { MerchStudio } from "@/components/dashboard/MerchStudio";
import { useClientAccount } from "@/components/dashboard/ClientAccountProvider";
import { appAlert } from "@/lib/app-notify";
import { formatMoney } from "@/lib/currency";
import { merchPrice, type MerchCommerceConfig } from "@/lib/merch-commerce";

type Suggestion = { id: string; name: string; reason: string };

export function CGiftsPortal() {
  const { dashboardPath } = useClientAccount();
  const [config, setConfig] = useState<MerchCommerceConfig | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [studio, setStudio] = useState(false);
  const [message, setMessage] = useState("");
  const [advice, setAdvice] = useState<{ message: string; suggestions: Suggestion[] } | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    fetch("/api/merch/config", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load gifts.");
      setConfig(payload);
    }).catch((error) => void appAlert(error.message || "Could not load gifts."));
  }, []);

  async function askAdvisor() {
    if (!message.trim() || asking) return;
    setAsking(true);
    try {
      const response = await fetch("/api/client/cgifts/advice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The gift advisor is unavailable.");
      setAdvice({ message: payload.message, suggestions: payload.suggestions || [] });
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "The gift advisor is unavailable.");
    } finally {
      setAsking(false);
    }
  }

  function customize(productId: string) {
    setSelectedProduct(productId);
    setStudio(true);
  }

  if (studio) return <MerchStudio experience="gifts" initialProductId={selectedProduct} onBack={() => setStudio(false)} onComplete={() => setStudio(false)} />;
  if (!config) return <div className="grid min-h-[70vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>;

  return (
    <div className="mx-auto w-full max-w-[1450px] space-y-6 p-3 sm:p-5 lg:p-8">
      <header className="rounded-[28px] border border-[#DDE5F4] bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl"><p className="text-xs font-semibold text-[#0A4FE8]">Gifts made personal</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#07113F] sm:text-4xl">cGifts</h1><p className="mt-3 text-sm leading-6 text-slate-500">Choose a gift, add your brand and move directly from customization to quotation or invoice. Your order continues in the existing CDS Space fulfilment flow.</p></div>
          <div className="flex gap-3"><Link href={dashboardPath("/dashboard/orders")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DDE5F4] px-4 text-xs font-semibold text-[#07113F]"><Package className="h-4 w-4 text-[#0A4FE8]" />Orders</Link><Link href={dashboardPath("/dashboard/invoices")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DDE5F4] px-4 text-xs font-semibold text-[#07113F]"><ReceiptText className="h-4 w-4 text-[#0A4FE8]" />Invoices</Link></div>
        </div>
      </header>

      <section className="rounded-[26px] bg-[#0A4FE8] p-6 text-white shadow-[0_20px_55px_rgba(10,79,232,.18)] sm:p-8">
        <div className="grid gap-7 lg:grid-cols-[.7fr_1.3fr] lg:items-start">
          <div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15"><MessageCircle className="h-5 w-5" /></span><h2 className="mt-5 text-2xl font-semibold">Gift advisor</h2><p className="mt-2 text-sm leading-6 text-blue-100">Describe the occasion, recipients, quantity and budget. The advisor will match your brief to products that are actually available.</p></div>
          <div className="rounded-[22px] bg-white p-4 text-[#07113F] sm:p-5">
            <label className="text-xs font-semibold" htmlFor="gift-brief">What are you planning?</label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row"><textarea id="gift-brief" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="For example: 40 welcome gifts for new employees, useful and premium, around $35 each." className="min-h-24 flex-1 resize-none rounded-xl border border-[#DDE5F4] p-3 text-sm outline-none focus:border-[#0A4FE8]" /><button onClick={() => void askAdvisor()} disabled={asking || !message.trim()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-xs font-semibold text-white disabled:opacity-50">{asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Ask advisor</button></div>
            {advice && <div className="mt-4 border-t border-slate-100 pt-4"><p className="text-xs leading-5 text-slate-600">{advice.message}</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{advice.suggestions.map((item) => <button key={item.id} onClick={() => customize(item.id)} className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-left"><p className="text-xs font-semibold text-[#07113F]">{item.name}</p><p className="mt-1 line-clamp-3 text-[10px] leading-4 text-slate-500">{item.reason}</p><span className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-[#0A4FE8]">Customize <ArrowRight className="h-3 w-3" /></span></button>)}</div></div>}
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4"><div><h2 className="text-2xl font-semibold tracking-[-0.025em] text-[#07113F]">Choose a gift</h2><p className="mt-1 text-xs text-slate-500">Every item can continue into branded artwork, fulfilment, an order and an invoice.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{config.products.map((product) => <article key={product.id} className="overflow-hidden rounded-[24px] border border-[#DDE5F4] bg-white shadow-sm"><div className="relative h-56 bg-[#F2F5FA]">{product.presentation_image_url ? <Image src={product.presentation_image_url} alt={product.name} fill unoptimized className="object-contain p-5" /> : <div className="grid h-full place-items-center"><Gift className="h-10 w-10 text-slate-300" /></div>}</div><div className="p-5"><h3 className="text-lg font-semibold text-[#07113F]">{product.name}</h3><p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-slate-500">{product.description || "Customizable for your campaign, team or occasion."}</p><div className="mt-5 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-[#0A4FE8]">{product.is_custom || merchPrice(product.prices, config.currency) <= 0 ? "Request quote" : `From ${formatMoney(merchPrice(product.prices, config.currency), config.currency)}`}</p><button onClick={() => customize(product.id)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-xs font-semibold text-white">Customize <ArrowRight className="h-3.5 w-3.5" /></button></div></div></article>)}</div>
      </section>
    </div>
  );
}
