"use client";

import { useCallback, useEffect, useState } from "react";
import { Cake, X, Copy, Check, Download, MessageCircle, Loader2, CalendarClock, Mail, PenLine, Send } from "lucide-react";

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

type Gender = "female" | "male";

/** The two designed cards. Which one is sent is the admin's call, per client. */
const GENDER_KEY = "cds.birthday.gender";

function cardUrl(name: string, gender: Gender) {
  return `/api/admin/clients/birthday-card?name=${encodeURIComponent(name)}&gender=${gender}`;
}

function storedGender(clientId: string): Gender {
  try {
    return window.localStorage.getItem(`${GENDER_KEY}.${clientId}`) === "male" ? "male" : "female";
  } catch {
    return "female";
  }
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
  const [gender, setGender] = useState<Gender>("female");
  const [hints, setHints] = useState("");
  const [showHints, setShowHints] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [emailHtml, setEmailHtml] = useState("");
  const [emailBusy, setEmailBusy] = useState<"" | "preview" | "send">("");
  const [emailSent, setEmailSent] = useState(false);
  const [actionError, setActionError] = useState("");
  const wa = waLink(client, message);

  // The choice of card is remembered per client, so reopening the same person
  // does not silently switch the design the team already sent them.
  useEffect(() => { setGender(storedGender(client.id)); }, [client.id]);

  const chooseGender = (next: Gender) => {
    setGender(next);
    setEmailHtml("");
    try { window.localStorage.setItem(`${GENDER_KEY}.${client.id}`, next); } catch { /* private mode */ }
  };

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

  const rewrite = async () => {
    setRewriting(true);
    setActionError("");
    try {
      const response = await fetch("/api/admin/clients/birthday-message", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: client.id, hints, current: message }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not rewrite the message");
      setMessage(payload.message);
      setEmailHtml("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not rewrite the message");
    } finally {
      setRewriting(false);
    }
  };

  const emailRequest = useCallback(async (preview: boolean) => {
    const response = await fetch("/api/admin/clients/birthday-email", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: client.id, message, gender, preview }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not build the email");
    return payload as { html?: string };
  }, [client.id, message, gender]);

  const previewEmail = async () => {
    setEmailBusy("preview");
    setActionError("");
    try {
      const payload = await emailRequest(true);
      setEmailHtml(payload.html || "");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not build the email");
    } finally {
      setEmailBusy("");
    }
  };

  const sendEmail = async () => {
    setEmailBusy("send");
    setActionError("");
    try {
      await emailRequest(false);
      setEmailSent(true);
      void markWished();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not send the email");
    } finally {
      setEmailBusy("");
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
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Card design</p>
            <div className="mb-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {(["female", "male"] as Gender[]).map((option) => (
                <button key={option} type="button" onClick={() => chooseGender(option)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-bold capitalize ${gender === option ? "bg-[#0A4FE8] text-white" : "text-slate-500 hover:text-slate-700"}`}>
                  {option}
                </button>
              ))}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cardUrl(client.name, gender)} alt={`Birthday card for ${client.name}`} className="w-full rounded-2xl border border-slate-100 shadow-sm" />
            <a href={cardUrl(client.name, gender)} download={`birthday-${client.name}.png`}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" /> Download image
            </a>
          </div>

          <div className="flex flex-col">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Message</p>
              <button type="button" onClick={() => setShowHints((open) => !open)}
                className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#0A4FE8] hover:underline">
                <PenLine className="h-3.5 w-3.5" /> {showHints ? "Hide AI hints" : "Rewrite with AI"}
              </button>
            </div>
            {showHints && (
              <div className="mb-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
                <textarea value={hints} onChange={(e) => setHints(e.target.value)} rows={3}
                  placeholder="Who is this client to us, and what should the message say? e.g. long-standing retainer client, we rebranded their bank last year, thank her for the trust and keep it formal."
                  className="w-full resize-none rounded-xl border border-blue-100 bg-white p-2.5 text-[12px] leading-relaxed text-slate-700 outline-none focus:border-blue-300" />
                <button type="button" onClick={() => { void rewrite(); }} disabled={rewriting}
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-60">
                  {rewriting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
                  {rewriting ? "Writing" : "Rewrite message"}
                </button>
              </div>
            )}
            <textarea value={message} onChange={(e) => { setMessage(e.target.value); setEmailHtml(""); }} rows={9}
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
              {client.email ? (
                <button type="button" onClick={() => { void previewEmail(); }} disabled={emailBusy === "preview"}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                  {emailBusy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {emailHtml ? "Refresh email preview" : "Email instead"}
                </button>
              ) : (
                <p className="text-center text-[11px] text-slate-400">Add an email address to send this by email.</p>
              )}
              {actionError && <p className="text-center text-[11px] font-medium text-red-500">{actionError}</p>}
              <button type="button" onClick={() => { void markWished(); }} disabled={marked || isMarking}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-[13px] font-bold text-[#0A4FE8] hover:bg-blue-100 disabled:cursor-default disabled:opacity-70">
                {isMarking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {marked ? "Marked as wished" : "Mark as wished"}
              </button>
              {markError && <p className="text-center text-[11px] font-medium text-red-500">{markError}</p>}
            </div>
          </div>
        </div>

        {emailHtml && (
          <div className="border-t border-slate-100 px-6 py-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Email preview</p>
              <p className="text-[11px] font-medium text-slate-400">To {client.email}</p>
            </div>
            {/* The preview is the exact HTML the recipient receives, so it is
                rendered in an isolated frame rather than inlined in the page. */}
            <iframe title="Birthday email preview" srcDoc={emailHtml} sandbox=""
              className="h-[420px] w-full rounded-2xl border border-slate-200 bg-white" />
            <button type="button" onClick={() => { void sendEmail(); }} disabled={emailBusy === "send" || emailSent}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-60">
              {emailBusy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : emailSent ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {emailSent ? "Email sent" : "Send this email"}
            </button>
          </div>
        )}
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
