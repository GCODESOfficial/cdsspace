"use client";

import { useEffect, useState } from "react";
import { Cake, X, Copy, Check, Download, MessageCircle, Loader2, CalendarClock } from "lucide-react";

export interface BirthdayClient {
  id: string;
  name: string;
  brand_name?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  birthday?: string | null;
  days_until?: number | null;
  preferred_contact_method?: "email" | "whatsapp" | "phone" | null;
  last_birthday_wish_at?: string | null;
  birthday_wished_for_year?: number | null;
  message?: string;
}

function cardUrl(name: string) {
  return `/api/admin/clients/birthday-card?name=${encodeURIComponent(name)}`;
}

function waLink(client: BirthdayClient, message: string) {
  const raw = (client.whatsapp || client.phone || "").replace(/[^\d]/g, "");
  if (!raw) return null;
  return `https://wa.me/${raw}?text=${encodeURIComponent(message)}`;
}

/** Full-screen modal: generated birthday design + editable message + tracked share actions. */
export function BirthdayModal({
  client,
  onClose,
  onWished,
}: {
  client: BirthdayClient;
  onClose: () => void;
  onWished?: (clientId: string, wishedForYear: number, wishedAt: string) => void;
}) {
  const [message, setMessage] = useState(client.message || `Happy Birthday, ${client.name}!`);
  const [copied, setCopied] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [marked, setMarked] = useState(false);
  const [markError, setMarkError] = useState("");
  const wa = waLink(client, message);

  const copy = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const markWished = async () => {
    if (marked || isMarking) return;
    setIsMarking(true);
    setMarkError("");
    try {
      const response = await fetch("/api/admin/clients/birthdays", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: client.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not update birthday outreach");
      setMarked(true);
      onWished?.(client.id, payload.wished_for_year, payload.wished_at);
    } catch (error) {
      setMarkError(error instanceof Error ? error.message : "Could not update birthday outreach");
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-pink-50 text-pink-600"><Cake className="h-5 w-5" /></span>
            <h3 className="text-lg font-bold text-[#0D1B39]">Celebrate {client.name}</h3>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-5 p-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Generated design</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cardUrl(client.name)} alt={`Birthday card for ${client.name}`} className="w-full rounded-2xl border border-slate-100 shadow-sm" />
            <a href={cardUrl(client.name)} download={`birthday-${client.name}.png`}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" /> Download image
            </a>
          </div>

          <div className="flex flex-col">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Message</p>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={9}
              className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-700 outline-none focus:border-blue-300 focus:bg-white" />
            <div className="mt-3 grid gap-2">
              <button onClick={copy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-bold text-white">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy message"}
              </button>
              {wa ? (
                <a href={wa} target="_blank" rel="noopener noreferrer"
                  onClick={() => { void markWished(); }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-600">
                  <MessageCircle className="h-4 w-4" /> Send on WhatsApp
                </a>
              ) : (
                <p className="text-center text-[11px] text-slate-400">Add a phone/WhatsApp number to send directly.</p>
              )}
              {client.email && (
                <a href={`mailto:${client.email}?subject=${encodeURIComponent("Happy Birthday from CDS Space")}&body=${encodeURIComponent(message)}`}
                  onClick={() => { void markWished(); }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
                  Email instead
                </a>
              )}
              <button type="button" onClick={() => { void markWished(); }} disabled={marked || isMarking}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-[13px] font-bold text-[#0A4FE8] hover:bg-blue-100 disabled:cursor-default disabled:opacity-70">
                {isMarking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {marked ? "Marked as wished" : "Mark as wished"}
              </button>
              {markError && <p className="text-center text-[11px] font-medium text-red-500">{markError}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const DISMISS_KEY = "cds.birthday.dismissed";

/** Dashboard pop-up: on the day, prompts the admin to send birthday wishes. */
export function BirthdayReminder() {
  const [reminders, setReminders] = useState<BirthdayClient[]>([]);
  const [open, setOpen] = useState(false);
  const [celebrate, setCelebrate] = useState<BirthdayClient | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/clients/birthdays?days=30", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { today: [], upcoming: [] }))
      .then((d) => {
        if (!active) return;
        const list: BirthdayClient[] = [...(d.today ?? []), ...(d.upcoming ?? [])];
        setReminders(list);
        const stamp = new Date().toISOString().slice(0, 10);
        const dismissed = typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY) === stamp;
        if (list.length > 0 && !dismissed) setOpen(true);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const dismiss = () => {
    setOpen(false);
    window.localStorage.setItem(DISMISS_KEY, new Date().toISOString().slice(0, 10));
  };

  const handleWished = (clientId: string) => {
    setReminders((current) => current.filter((client) => client.id !== clientId));
  };

  if (!open || reminders.length === 0) {
    return celebrate ? <BirthdayModal client={celebrate} onClose={() => setCelebrate(null)} onWished={handleWished} /> : null;
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[110] w-[min(92vw,360px)] overflow-hidden rounded-3xl border border-pink-100 bg-white shadow-2xl">
        <div className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-3 text-white">
          <CalendarClock className="h-5 w-5" />
          <p className="text-[14px] font-bold">{reminders.length === 1 ? "1 client birthday reminder" : `${reminders.length} client birthday reminders`}</p>
          <button onClick={dismiss} className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-white/80 hover:bg-white/20"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {reminders.map((client) => (
            <div key={client.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[#0D1B39]">{client.name}</p>
                <p className="truncate text-[11px] font-medium text-pink-600">
                  {client.days_until === 0 ? "Today 🎂" : client.days_until === 1 ? "Tomorrow" : `In ${client.days_until} days`}
                  {client.brand_name ? ` · ${client.brand_name}` : ""}
                </p>
              </div>
              <button onClick={() => setCelebrate(client)}
                className="shrink-0 rounded-lg bg-[#0A4FE8] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#083EC0]">
                Send wishes
              </button>
            </div>
          ))}
        </div>
      </div>
      {celebrate && <BirthdayModal client={celebrate} onClose={() => setCelebrate(null)} onWished={handleWished} />}
    </>
  );
}
