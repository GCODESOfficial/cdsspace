/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, BarChart3, BriefcaseBusiness, Building2, CheckCircle2, CircleAlert,
  Compass, Download, ExternalLink, FileText, Globe2, Inbox, Loader2, Mail,
  Megaphone, Network, PenLine, Plus, RefreshCw, Rocket, Search, Send, ShieldCheck,
  Target, Telescope, UserRoundSearch, UsersRound,
} from "lucide-react";
import { CDS_SERVICE_LINES } from "@/lib/sales-growth-shared";
import { appConfirm } from "@/lib/app-notify";

type GrowthState = {
  workspaces: any[];
  active: any | null;
  competitors: any[];
  campaigns: any[];
  prospects: any[];
  contacts: any[];
  emails: any[];
  proposals: any[];
  metrics: { sent: number; replied: number; qualified: number; won: number };
};

const STEPS = [
  { id: 1, label: "Foundation", note: "Research the company", icon: Compass },
  { id: 2, label: "Competitors", note: "Map the category", icon: Network },
  { id: 3, label: "Campaigns", note: "Build niche theses", icon: Megaphone },
  { id: 4, label: "Prospects", note: "Find buying signals", icon: Building2 },
  { id: 5, label: "Outreach", note: "Create the approach", icon: PenLine },
  { id: 6, label: "Launch", note: "Approve and deliver", icon: Send },
];

const EMPTY_STATE: GrowthState = { workspaces: [], active: null, competitors: [], campaigns: [], prospects: [], contacts: [], emails: [], proposals: [], metrics: { sent: 0, replied: 0, qualified: 0, won: 0 } };

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function comma(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function shortDomain(value: string | null | undefined) {
  return String(value || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function statusTone(status: string) {
  if (["sent", "won", "qualified", "active", "approved"].includes(status)) return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (["failed", "lost", "suppressed"].includes(status)) return "bg-rose-50 text-rose-700 border-rose-100";
  if (["ready", "contacted", "replied", "researched"].includes(status)) return "bg-blue-50 text-blue-700 border-blue-100";
  return "bg-slate-50 text-slate-600 border-slate-100";
}

export default function SalesGrowthPage() {
  const [data, setData] = useState<GrowthState>(EMPTY_STATE);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [foundation, setFoundation] = useState({ name: "CDS Space Global Growth", company_name: "CDS Space", company_domain: "cdsspace.pro", headquarters: "Uyo, Nigeria", markets: "Nigeria, Rwanda, United Kingdom, United States, Asia", services: CDS_SERVICE_LINES.join(", "), brand_voice: "Direct, intelligent, concise, globally ambitious, commercially brave" });
  const [competitorQuery, setCompetitorQuery] = useState("global brand strategy and design studio");
  const [market, setMarket] = useState("Nigeria, Rwanda, United Kingdom, United States");
  const [campaignId, setCampaignId] = useState("");
  const [prospectQuery, setProspectQuery] = useState("");
  const [prospectId, setProspectId] = useState("");
  const [contactId, setContactId] = useState("");
  const [contactForm, setContactForm] = useState({ full_name: "", job_title: "", email: "", linkedin_url: "", source_url: "", verification_status: "unverified" });
  const [draftEdits, setDraftEdits] = useState<Record<string, { recipient_email: string; subject: string; body_text: string }>>({});

  const load = useCallback(async (workspaceId?: string) => {
    const suffix = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : "";
    const response = await fetch(`/api/admin/clients/growth${suffix}`, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Could not load Growth Engine.");
    setData(json);
    if (json.active) {
      setFoundation({
        name: json.active.name || "",
        company_name: json.active.company_name || "",
        company_domain: json.active.company_domain || "",
        headquarters: json.active.headquarters || "",
        markets: (json.active.markets || []).join(", "),
        services: (json.active.services || []).join(", "),
        brand_voice: json.active.brand_voice || "",
      });
      if (!campaignId && json.campaigns?.[0]) setCampaignId(json.campaigns[0].id);
      if (!prospectId && json.prospects?.[0]) setProspectId(json.prospects[0].id);
    }
  }, [campaignId, prospectId]);

  useEffect(() => {
    load().catch((error) => setNotice({ tone: "error", text: error.message })).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const next: Record<string, { recipient_email: string; subject: string; body_text: string }> = {};
    data.emails.forEach((email) => {
      next[email.id] = { recipient_email: email.recipient_email || "", subject: email.subject || "", body_text: email.body_text || "" };
    });
    setDraftEdits(next);
  }, [data.emails]);

  const perform = async (action: string, payload: Record<string, unknown> = {}, success?: string) => {
    setBusy(action);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/clients/growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, workspace_id: data.active?.id, ...payload }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "The request could not be completed.");
      const nextId = json.workspace?.id || data.active?.id;
      await load(nextId);
      if (success) setNotice({ tone: "success", text: success });
      return json;
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "The request could not be completed." });
      return null;
    } finally {
      setBusy("");
    }
  };

  const selectedProspect = data.prospects.find((item) => item.id === prospectId) || data.prospects[0] || null;
  const selectedContacts = data.contacts.filter((item) => item.prospect_id === selectedProspect?.id);
  const selectedContact = selectedContacts.find((item) => item.id === contactId) || selectedContacts[0] || null;
  const prospectEmails = data.emails.filter((item) => item.prospect_id === selectedProspect?.id);
  const prospectProposal = data.proposals.find((item) => item.prospect_id === selectedProspect?.id) || null;

  useEffect(() => {
    if (selectedProspect && selectedProspect.id !== prospectId) setProspectId(selectedProspect.id);
    if (selectedContact && selectedContact.id !== contactId) setContactId(selectedContact.id);
  }, [selectedProspect, selectedContact, prospectId, contactId]);

  if (loading) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>;

  if (!data.active) {
    return (
      <main className="mx-auto max-w-5xl p-4 sm:p-8 lg:p-12">
        <div className="overflow-hidden rounded-[30px] border border-blue-100 bg-white shadow-[0_30px_90px_rgba(18,63,145,0.12)]">
          <div className="relative overflow-hidden bg-[#0A4FE8] px-7 py-12 text-white sm:px-12">
            <div className="absolute -right-20 -top-36 h-80 w-80 rounded-full bg-blue-400/20" />
            <div className="absolute -bottom-40 right-24 h-72 w-72 rounded-full bg-blue-900/20" />
            <Rocket className="mb-7 h-9 w-9" />
            <p className="text-xs font-semibold text-blue-100">Deals · Growth Engine</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.04] sm:text-6xl">Turn category intelligence into conversations worth having.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-blue-100">Research competitors, find public buying signals, build niche campaigns, identify decision-makers, and create approved outreach from one CDS Space system.</p>
          </div>
          <form className="grid gap-5 p-7 sm:grid-cols-2 sm:p-12" onSubmit={async (event) => { event.preventDefault(); await perform("create_workspace", { ...foundation, markets: comma(foundation.markets), services: comma(foundation.services) }, "Growth workspace created."); }}>
            <Field label="Workspace name" value={foundation.name} onChange={(value) => setFoundation((state) => ({ ...state, name: value }))} />
            <Field label="Company" value={foundation.company_name} onChange={(value) => setFoundation((state) => ({ ...state, company_name: value }))} />
            <Field label="Public website" value={foundation.company_domain} onChange={(value) => setFoundation((state) => ({ ...state, company_domain: value }))} />
            <Field label="Headquarters" value={foundation.headquarters} onChange={(value) => setFoundation((state) => ({ ...state, headquarters: value }))} />
            <div className="sm:col-span-2"><Field label="Priority markets" hint="Separate markets with commas" value={foundation.markets} onChange={(value) => setFoundation((state) => ({ ...state, markets: value }))} /></div>
            <div className="sm:col-span-2"><Field label="Service lines" hint="These become the raw material for niche campaigns" textarea value={foundation.services} onChange={(value) => setFoundation((state) => ({ ...state, services: value }))} /></div>
            {notice && <Notice notice={notice} className="sm:col-span-2" />}
            <button disabled={Boolean(busy)} className="sm:col-span-2 inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-[#0A4FE8] px-6 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-[#073EC0] disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Build the Growth Engine
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1680px] p-3 sm:p-5 xl:p-7">
      <header className="relative mb-5 overflow-hidden rounded-[26px] bg-[#07133B] px-6 py-7 text-white shadow-[0_20px_60px_rgba(7,19,59,0.18)] sm:px-8">
        <div className="absolute -right-16 -top-32 h-72 w-72 rounded-full bg-[#0A4FE8]/35" />
        <div className="absolute -bottom-28 right-44 h-56 w-56 rounded-full bg-blue-800/30" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[12px] font-semibold text-blue-200"><Rocket className="h-4 w-4" /> Deals · Growth Engine</div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{data.active.name}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Source-backed market intelligence, unconventional campaign thinking, and human-approved outreach. Permanently abnormal. Always accountable.</p>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:min-w-[430px]">
            <Metric label="Prospects" value={data.prospects.length} />
            <Metric label="Sent" value={data.metrics.sent || 0} />
            <Metric label="Replies" value={data.metrics.replied || 0} />
            <Metric label="Qualified" value={data.metrics.qualified || 0} />
          </div>
        </div>
      </header>

      {notice && <Notice notice={notice} className="mb-5" />}

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[24px] border border-blue-100 bg-white p-3 shadow-sm xl:sticky xl:top-5">
          <div className="mb-3 rounded-2xl bg-[#F4F7FD] p-3">
            <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Workspace</label>
            <select value={data.active.id} onChange={(event) => { setLoading(true); load(event.target.value).finally(() => setLoading(false)); }} className="mt-1.5 w-full bg-transparent text-sm font-bold text-[#07133B] outline-none">
              {data.workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <nav className="space-y-1">
            {STEPS.map((item) => {
              const active = step === item.id;
              const Icon = item.icon;
              return (
                <button key={item.id} type="button" onClick={() => setStep(item.id)} className={classNames("flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition", active ? "bg-[#0A4FE8] text-white shadow-lg shadow-blue-200" : "text-slate-600 hover:bg-blue-50 hover:text-[#07133B]") }>
                  <span className={classNames("grid h-9 w-9 shrink-0 place-items-center rounded-xl", active ? "bg-white/15" : "bg-[#F0F5FF] text-[#0A4FE8]")}><Icon className="h-4.5 w-4.5" /></span>
                  <span className="min-w-0"><span className="block text-[13px] font-bold">{item.id}. {item.label}</span><span className={classNames("block truncate text-[10px]", active ? "text-blue-100" : "text-slate-400")}>{item.note}</span></span>
                </button>
              );
            })}
          </nav>
          <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#07133B]"><ShieldCheck className="h-4 w-4 text-[#0A4FE8]" /> Human approval gate</div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">Research can refresh automatically. External email cannot leave CDS Space until an authorised admin approves it.</p>
          </div>
        </aside>

        <section className="min-w-0">
          {step === 1 && <FoundationStep data={data} foundation={foundation} setFoundation={setFoundation} busy={busy} perform={perform} />}
          {step === 2 && <CompetitorStep data={data} query={competitorQuery} setQuery={setCompetitorQuery} market={market} setMarket={setMarket} busy={busy} perform={perform} />}
          {step === 3 && <CampaignStep data={data} busy={busy} perform={perform} onChoose={(id: string) => { setCampaignId(id); setStep(4); }} />}
          {step === 4 && <ProspectStep data={data} campaignId={campaignId} setCampaignId={setCampaignId} query={prospectQuery} setQuery={setProspectQuery} busy={busy} perform={perform} onChoose={(id: string) => { setProspectId(id); setContactId(""); setStep(5); }} />}
          {step === 5 && <OutreachStep data={data} prospectId={selectedProspect?.id || ""} setProspectId={(id: string) => { setProspectId(id); setContactId(""); }} selectedProspect={selectedProspect} selectedContacts={selectedContacts} contactId={selectedContact?.id || ""} setContactId={setContactId} contactForm={contactForm} setContactForm={setContactForm} emails={prospectEmails} proposal={prospectProposal} busy={busy} perform={perform} onLaunch={() => setStep(6)} />}
          {step === 6 && <LaunchStep data={data} busy={busy} perform={perform} draftEdits={draftEdits} setDraftEdits={setDraftEdits} />}
        </section>
      </div>
    </main>
  );
}

function FoundationStep({ data, foundation, setFoundation, busy, perform }: any) {
  return <Panel eyebrow="01 · Company intelligence" title="Know exactly what we sell before finding anyone to buy it." description="The public website is evidence. The corporate profile is strategic context. Together they become one approved market foundation.">
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <form className="grid gap-4 rounded-2xl border border-slate-100 bg-white p-5 sm:grid-cols-2" onSubmit={async (event) => { event.preventDefault(); await perform("update_workspace", { ...foundation, markets: comma(foundation.markets), services: comma(foundation.services) }, "Foundation saved."); }}>
        <Field label="Workspace" value={foundation.name} onChange={(value) => setFoundation((state: any) => ({ ...state, name: value }))} />
        <Field label="Company" value={foundation.company_name} onChange={(value) => setFoundation((state: any) => ({ ...state, company_name: value }))} />
        <Field label="Website" value={foundation.company_domain} onChange={(value) => setFoundation((state: any) => ({ ...state, company_domain: value }))} />
        <Field label="Headquarters" value={foundation.headquarters} onChange={(value) => setFoundation((state: any) => ({ ...state, headquarters: value }))} />
        <div className="sm:col-span-2"><Field label="Priority markets" value={foundation.markets} onChange={(value) => setFoundation((state: any) => ({ ...state, markets: value }))} /></div>
        <div className="sm:col-span-2"><Field label="Service lines" textarea value={foundation.services} onChange={(value) => setFoundation((state: any) => ({ ...state, services: value }))} /></div>
        <div className="sm:col-span-2"><Field label="Brand voice" value={foundation.brand_voice} onChange={(value) => setFoundation((state: any) => ({ ...state, brand_voice: value }))} /></div>
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <ActionButton busy={busy === "update_workspace"} icon={CheckCircle2}>Save foundation</ActionButton>
          <button type="button" disabled={Boolean(busy)} onClick={() => perform("research_company", {}, "Public website researched and market foundation updated.")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-[#0A4FE8] hover:bg-blue-100 disabled:opacity-60">{busy === "research_company" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Telescope className="h-4 w-4" />} Research public website</button>
        </div>
      </form>
      <div className="space-y-4">
        <InsightCard icon={Target} label="Positioning" text={data.active.positioning || "Research the public website to sharpen positioning."} />
        <InsightCard icon={Globe2} label="Company read" text={data.active.company_summary || "The approved company summary will appear here."} />
        <div className="rounded-2xl border border-slate-100 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Research sources</p><div className="mt-3 space-y-2">{(data.active.research_sources || []).length ? data.active.research_sources.map((source: any) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 truncate text-xs font-semibold text-[#0A4FE8] hover:underline"><ExternalLink className="h-3.5 w-3.5 shrink-0" /> {shortDomain(source.url)}</a>) : <p className="text-xs leading-5 text-slate-400">No public source captured yet.</p>}</div></div>
      </div>
    </div>
  </Panel>;
}

function CompetitorStep({ data, query, setQuery, market, setMarket, busy, perform }: any) {
  return <Panel eyebrow="02 · Category map" title="Find where competitors are strong, then look where they are absent." description="Discovery uses public search results. Client signals only come from public work, client, portfolio, or case-study pages and always require review.">
    <div className="mb-5 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 md:grid-cols-[1fr_1fr_auto]">
      <Field label="Competitor search" value={query} onChange={setQuery} />
      <Field label="Market" value={market} onChange={setMarket} />
      <button disabled={Boolean(busy)} onClick={() => perform("discover_competitors", { query, market }, "Competitor map refreshed from public search.")} className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-bold text-white disabled:opacity-60">{busy === "discover_competitors" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Discover</button>
    </div>
    {data.competitors.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{data.competitors.map((item: any) => <article key={item.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-base font-bold text-[#07133B]">{item.name}</p>{item.domain && <a href={`https://${item.domain}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#0A4FE8] hover:underline">{item.domain}<ExternalLink className="h-3 w-3" /></a>}</div><span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-500">{item.confidence}% evidence</span></div>
      <p className="mt-4 line-clamp-4 text-xs leading-5 text-slate-500">{item.summary || "Scan the public site to build the competitor read."}</p>
      <div className="mt-4 rounded-xl bg-[#F4F7FD] p-3"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Public client signals</p><span className="text-[10px] font-bold text-[#0A4FE8]">{(item.client_signals || []).length}</span></div>{(item.client_signals || []).slice(0, 3).map((signal: any) => <a key={signal.domain} href={signal.source_url} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-between gap-2 text-xs font-semibold text-[#07133B] hover:text-[#0A4FE8]"><span className="truncate">{signal.name}</span><ExternalLink className="h-3 w-3 shrink-0" /></a>)}{!(item.client_signals || []).length && <p className="mt-2 text-[11px] leading-4 text-slate-400">None captured yet. This is not proof of no clients.</p>}</div>
      <button disabled={Boolean(busy)} onClick={() => perform("scan_competitor", { competitor_id: item.id }, `${item.name} public work pages scanned.`)} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#0A4FE8] disabled:opacity-50">{busy === "scan_competitor" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Scan public evidence</button>
    </article>)}</div> : <Empty icon={Network} title="No competitors mapped" text="Start with a service niche and market. The system will collect public candidates for your review." />}
  </Panel>;
}

function CampaignStep({ data, busy, perform, onChoose }: any) {
  return <Panel eyebrow="03 · Campaign architecture" title="Build a different commercial thesis for every service niche." description="Campaigns are organised around a buying moment and a visible business pressure, not a generic industry list." action={<button disabled={Boolean(busy)} onClick={() => perform("build_campaigns", {}, "Niche campaign theses built.")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-sm font-bold text-white disabled:opacity-60">{busy === "build_campaigns" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BriefcaseBusiness className="h-4 w-4" />} Build campaign set</button>}>
    {data.campaigns.length ? <div className="grid gap-4 lg:grid-cols-2">{data.campaigns.map((campaign: any, index: number) => <article key={campaign.id} className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-4 border-b border-slate-50 p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0A4FE8]">Campaign {String(index + 1).padStart(2, "0")}</p><h3 className="mt-2 text-xl font-bold text-[#07133B]">{campaign.name}</h3><p className="mt-1 text-xs font-semibold text-slate-400">{campaign.service_niche}</p></div><span className={classNames("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase", statusTone(campaign.status))}>{campaign.status}</span></div>
      <div className="p-5"><p className="text-sm font-semibold leading-6 text-[#07133B]">{campaign.opening_hook}</p><p className="mt-3 text-xs leading-5 text-slate-500">{campaign.audience}</p><div className="mt-4 flex flex-wrap gap-1.5">{(campaign.pain_points || []).map((pain: string) => <span key={pain} className="rounded-lg bg-[#F4F7FD] px-2.5 py-1.5 text-[10px] font-semibold text-slate-500">{pain}</span>)}</div><div className="mt-5 rounded-xl border-l-4 border-[#0A4FE8] bg-blue-50/60 p-3 text-xs leading-5 text-slate-600">{campaign.value_proposition}</div><button onClick={() => onChoose(campaign.id)} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#0A4FE8]">Find companies for this campaign <ArrowRight className="h-3.5 w-3.5" /></button></div>
    </article>)}</div> : <Empty icon={Megaphone} title="No campaign theses yet" text="Build a campaign set from the approved foundation and competitor map." />}
  </Panel>;
}

function ProspectStep({ data, campaignId, setCampaignId, query, setQuery, busy, perform, onChoose }: any) {
  return <Panel eyebrow="04 · Prospect intelligence" title="Find companies with a reason to care now." description="Bring your own leads or search the open web. Every discovered company keeps its public source and remains unapproved until a person reviews it.">
    <div className="mb-5 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 lg:grid-cols-[280px_1fr_auto]">
      <label className="block"><span className="mb-1.5 block text-[11px] font-bold text-slate-600">Campaign</span><select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#07133B] outline-none focus:border-blue-400"><option value="">Choose campaign</option>{data.campaigns.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <Field label="Open-web search" hint="Leave blank to use the campaign audience and market" value={query} onChange={setQuery} />
      <button disabled={Boolean(busy) || !campaignId} onClick={() => perform("discover_prospects", { campaign_id: campaignId, query }, "Public prospect search completed.")} className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-bold text-white disabled:opacity-50">{busy === "discover_prospects" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundSearch className="h-4 w-4" />} Find prospects</button>
    </div>
    {data.prospects.length ? <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white"><div className="hidden grid-cols-[minmax(220px,1.2fr)_minmax(260px,1.6fr)_110px_120px_150px] gap-4 border-b border-slate-100 bg-[#F8FAFD] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400 lg:grid"><span>Company</span><span>Public evidence</span><span>Fit</span><span>Status</span><span className="text-right">Action</span></div>{data.prospects.map((item: any) => <div key={item.id} className="grid gap-3 border-b border-slate-50 px-5 py-4 last:border-0 lg:grid-cols-[minmax(220px,1.2fr)_minmax(260px,1.6fr)_110px_120px_150px] lg:items-center">
      <div className="min-w-0"><p className="truncate text-sm font-bold text-[#07133B]">{item.company_name}</p><div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">{item.domain && <span>{item.domain}</span>}{item.location && <span>· {item.location}</span>}</div></div>
      <p className="line-clamp-2 text-xs leading-5 text-slate-500">{item.description || "No description captured yet."}</p>
      <div><span className="text-lg font-bold text-[#07133B]">{item.fit_score}</span><span className="text-[10px] text-slate-400"> / 100</span></div>
      <span className={classNames("w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase", statusTone(item.status))}>{item.status}</span>
      <div className="flex justify-end gap-2"><button disabled={Boolean(busy)} onClick={() => perform("enrich_prospect", { prospect_id: item.id }, `${item.company_name} public contacts researched.`)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-blue-200 hover:text-[#0A4FE8]" title="Research public contacts">{busy === "enrich_prospect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}</button><button onClick={() => onChoose(item.id)} className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#07133B] px-3 text-[11px] font-bold text-white">Open <ArrowRight className="h-3 w-3" /></button></div>
    </div>)}</div> : <Empty icon={Building2} title="No prospects yet" text="Choose a campaign and search for companies matching its buying moment." />}
  </Panel>;
}

function OutreachStep({ data, prospectId, setProspectId, selectedProspect, selectedContacts, contactId, setContactId, contactForm, setContactForm, emails, proposal, busy, perform, onLaunch }: any) {
  return <Panel eyebrow="05 · Outreach studio" title="Make the first contact useful before making it clever." description="Research the person, write one decisive email, create a short visual hook, and build a CDS-branded proposal from the same commercial idea.">
    <div className="grid gap-5 2xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-4"><label className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Prospect</label><select value={prospectId} onChange={(event) => setProspectId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-[#07133B] outline-none">{data.prospects.map((item: any) => <option key={item.id} value={item.id}>{item.company_name}</option>)}</select>{selectedProspect && <><p className="mt-4 text-xs leading-5 text-slate-500">{selectedProspect.description || "Research this company to capture public evidence."}</p><div className="mt-3 flex flex-wrap gap-2"><Tag>{selectedProspect.fit_score}% fit</Tag><Tag>{selectedProspect.status}</Tag></div></>}</div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-center justify-between"><p className="text-xs font-bold text-[#07133B]">Decision-makers</p><span className="text-[10px] font-bold text-slate-400">{selectedContacts.length}</span></div>{selectedContacts.length ? <div className="mt-3 space-y-2">{selectedContacts.map((contact: any) => <button key={contact.id} onClick={() => setContactId(contact.id)} className={classNames("w-full rounded-xl border p-3 text-left transition", contactId === contact.id ? "border-blue-400 bg-blue-50" : "border-slate-100 hover:border-blue-200")}><p className="text-xs font-bold text-[#07133B]">{contact.full_name || "Public contact"}</p><p className="mt-0.5 text-[10px] text-slate-500">{contact.job_title || "Role not published"}</p><p className="mt-1 truncate text-[10px] font-semibold text-[#0A4FE8]">{contact.email || "Email not published"}</p><p className="mt-1 text-[9px] uppercase tracking-wide text-slate-400">{contact.verification_status}</p></button>)}</div> : <p className="mt-3 text-[11px] leading-5 text-slate-400">No public contact found. Add one only from a source you can review.</p>}</div>
        <form className="rounded-2xl border border-slate-100 bg-white p-4" onSubmit={async (event) => { event.preventDefault(); const result = await perform("save_contact", { prospect_id: prospectId, ...contactForm }, "Decision-maker saved."); if (result) setContactForm({ full_name: "", job_title: "", email: "", linkedin_url: "", source_url: "", verification_status: "unverified" }); }}><p className="mb-3 text-xs font-bold text-[#07133B]">Add reviewed contact</p><div className="space-y-3"><Field label="Name" value={contactForm.full_name} onChange={(value) => setContactForm((state: any) => ({ ...state, full_name: value }))} /><Field label="Role" value={contactForm.job_title} onChange={(value) => setContactForm((state: any) => ({ ...state, job_title: value }))} /><Field label="Email" value={contactForm.email} onChange={(value) => setContactForm((state: any) => ({ ...state, email: value }))} /><Field label="Public source URL" value={contactForm.source_url} onChange={(value) => setContactForm((state: any) => ({ ...state, source_url: value }))} /></div><button disabled={Boolean(busy) || !prospectId} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 px-3 text-xs font-bold text-[#0A4FE8] disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Add contact</button></form>
      </div>
      <div className="space-y-5">
        <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0A4FE8]">One idea · Three outputs</p><h3 className="mt-1 text-lg font-bold text-[#07133B]">Email, visual hook, proposal</h3></div><button disabled={Boolean(busy) || !selectedProspect} onClick={() => perform("generate_outreach", { prospect_id: prospectId, contact_id: contactId }, "Outreach pack created for human review.")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-sm font-bold text-white disabled:opacity-50">{busy === "generate_outreach" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />} Create outreach pack</button></div></div>
        {emails.length ? <div className="rounded-2xl border border-slate-100 bg-white p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-[#07133B]">Latest email</h3><Tag>{emails[0].status}</Tag></div><p className="mt-4 text-sm font-bold text-[#07133B]">{emails[0].subject}</p><pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-6 text-slate-600">{emails[0].body_text}</pre></div> : <Empty compact icon={Mail} title="Email not written" text="Create the outreach pack after choosing a reviewed contact." />}
        {proposal ? <div className="grid gap-5 lg:grid-cols-2"><div className="relative min-h-[330px] overflow-hidden rounded-2xl bg-[#0A4FE8] p-7 text-white"><div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-300/15" /><p className="relative text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">{proposal.visual_hook?.eyebrow || "Brand direction"}</p><h3 className="relative mt-14 max-w-md text-3xl font-bold leading-tight">{proposal.visual_hook?.headline || proposal.executive_line}</h3><p className="relative mt-5 text-sm text-blue-100">{proposal.visual_hook?.subline}</p><p className="absolute bottom-6 right-7 text-xs font-bold tracking-widest">CDS SPACE</p></div><div className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-white p-6"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0A4FE8]">Proposal builder</p><h3 className="mt-2 text-xl font-bold text-[#07133B]">{proposal.title}</h3><p className="mt-3 text-xs leading-5 text-slate-500">{proposal.executive_line}</p><div className="mt-4 flex flex-wrap gap-1.5">{(proposal.deliverables || []).slice(0, 4).map((item: string) => <Tag key={item}>{item}</Tag>)}</div></div><div className="mt-6 flex flex-wrap gap-2"><a href={`/api/admin/clients/growth/proposals/${proposal.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#07133B] px-3 text-xs font-bold text-white"><FileText className="h-3.5 w-3.5" /> Download proposal</a><a href={`/api/admin/clients/growth/hooks/${proposal.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 px-3 text-xs font-bold text-[#0A4FE8]"><Download className="h-3.5 w-3.5" /> Visual hook</a><button onClick={onLaunch} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-50 px-3 text-xs font-bold text-[#0A4FE8]">Review launch <ArrowRight className="h-3.5 w-3.5" /></button></div></div></div> : <Empty compact icon={FileText} title="Proposal not built" text="The proposal will use the supplied CDS Space blue system and concise problem-solution structure." />}
      </div>
    </div>
  </Panel>;
}

function LaunchStep({ data, busy, perform, draftEdits, setDraftEdits }: any) {
  return <Panel eyebrow="06 · Approval and delivery" title="Nothing goes out because a machine said it was ready." description="Edit the message, approve it with the responsible admin identity, and send it through the configured CDS Space email transport. Replies and outcomes can then be marked on the prospect record.">
    <div className="mb-5 grid gap-3 sm:grid-cols-4"><LaunchMetric icon={Inbox} label="Drafts" value={data.emails.filter((item: any) => item.status === "draft").length} /><LaunchMetric icon={ShieldCheck} label="Approved" value={data.emails.filter((item: any) => item.status === "approved").length} /><LaunchMetric icon={Send} label="Sent" value={data.emails.filter((item: any) => item.status === "sent").length} /><LaunchMetric icon={UsersRound} label="Replies" value={data.emails.filter((item: any) => item.status === "replied").length} /></div>
    {data.emails.length ? <div className="space-y-4">{data.emails.map((email: any) => { const draft = draftEdits[email.id] || { recipient_email: email.recipient_email || "", subject: email.subject || "", body_text: email.body_text || "" }; const proposal = data.proposals.find((item: any) => item.prospect_id === email.prospect_id); return <article key={email.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-bold text-[#07133B]">{email.company_name}</h3><span className={classNames("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase", statusTone(email.status))}>{email.status}</span><Tag>Step {email.sequence_step}</Tag></div><p className="mt-1 text-xs text-slate-400">{email.contact_name || "Unassigned contact"}{email.job_title ? ` · ${email.job_title}` : ""}</p></div><div className="flex flex-wrap gap-2">{proposal && <><a href={`/api/admin/clients/growth/proposals/${proposal.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[11px] font-bold text-slate-600"><FileText className="h-3.5 w-3.5" /> Proposal</a><a href={`/api/admin/clients/growth/hooks/${proposal.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[11px] font-bold text-slate-600"><Download className="h-3.5 w-3.5" /> Hook</a></>}</div></div>
      <div className="mt-4 grid gap-3"><Field label="Recipient" value={draft.recipient_email} disabled={email.status === "sent"} onChange={(value) => setDraftEdits((state: any) => ({ ...state, [email.id]: { ...draft, recipient_email: value } }))} /><Field label="Subject" value={draft.subject} disabled={email.status === "sent"} onChange={(value) => setDraftEdits((state: any) => ({ ...state, [email.id]: { ...draft, subject: value } }))} /><Field label="Message" textarea rows={10} value={draft.body_text} disabled={email.status === "sent"} onChange={(value) => setDraftEdits((state: any) => ({ ...state, [email.id]: { ...draft, body_text: value } }))} /></div>
      <div className="mt-4 flex flex-wrap items-center gap-2">{email.status !== "sent" && <button disabled={Boolean(busy)} onClick={() => perform("update_email", { email_id: email.id, ...draft }, "Email draft saved. Approval was reset because the content changed.")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Save draft</button>}{["draft", "failed"].includes(email.status) && <button disabled={Boolean(busy) || !draft.recipient_email} onClick={() => perform("approve_email", { email_id: email.id }, "Email approved. It is now eligible to send.")} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-50 px-3 text-xs font-bold text-[#0A4FE8] disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" /> Approve</button>}{email.status === "approved" && <button disabled={Boolean(busy)} onClick={async () => { if (!(await appConfirm(`Send this approved email to ${email.recipient_email}?`))) return; await perform("send_email", { email_id: email.id }, "Email delivered through the configured CDS Space transport."); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-xs font-bold text-white disabled:opacity-50">{busy === "send_email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send approved email</button>}{email.status === "failed" && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600"><CircleAlert className="h-3.5 w-3.5" /> {email.delivery_error}</span>}{email.sent_at && <span className="text-[11px] font-semibold text-emerald-600">Sent {new Date(email.sent_at).toLocaleString()}</span>}</div>
    </article>; })}</div> : <Empty icon={Mail} title="Launch queue is empty" text="Create an outreach pack for a reviewed prospect. Its email sequence will appear here as drafts." />}
  </Panel>;
}

function Panel({ eyebrow, title, description, action, children }: { eyebrow: string; title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <div><div className="mb-5 flex flex-col gap-4 rounded-[24px] border border-blue-100 bg-white p-6 shadow-sm md:flex-row md:items-end md:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0A4FE8]">{eyebrow}</p><h2 className="mt-2 max-w-4xl text-2xl font-bold tracking-tight text-[#07133B] sm:text-3xl">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p></div>{action && <div className="shrink-0">{action}</div>}</div>{children}</div>;
}

function Field({ label, hint, value, onChange, textarea = false, rows = 4, disabled = false }: { label: string; hint?: string; value: string; onChange: (value: string) => void; textarea?: boolean; rows?: number; disabled?: boolean }) {
  const classes = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#07133B] outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400";
  return <label className="block"><span className="mb-1.5 block text-[11px] font-bold text-slate-600">{label}</span>{textarea ? <textarea rows={rows} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={classes} /> : <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${classes} h-11`} />}{hint && <span className="mt-1 block text-[10px] leading-4 text-slate-400">{hint}</span>}</label>;
}

function ActionButton({ busy, icon: Icon, children }: { busy: boolean; icon: React.ElementType; children: React.ReactNode }) {
  return <button disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#07133B] px-4 text-sm font-bold text-white disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}{children}</button>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-center"><p className="text-xl font-bold">{value}</p><p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p></div>; }
function LaunchMetric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) { return <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><Icon className="h-4.5 w-4.5" /></span><div><p className="text-xl font-bold text-[#07133B]">{value}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p></div></div>; }
function InsightCard({ icon: Icon, label, text }: { icon: React.ElementType; label: string; text: string }) { return <div className="rounded-2xl border border-slate-100 bg-white p-5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><Icon className="h-4 w-4" /></span><p className="mt-4 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{label}</p><p className="mt-2 text-sm font-semibold leading-6 text-[#07133B]">{text}</p></div>; }
function Tag({ children }: { children: React.ReactNode }) { return <span className="inline-flex rounded-lg bg-[#F1F5FC] px-2.5 py-1.5 text-[10px] font-bold text-slate-500">{children}</span>; }
function Notice({ notice, className }: { notice: { tone: "success" | "error"; text: string }; className?: string }) { return <div className={classNames("flex items-start gap-2 rounded-xl border px-4 py-3 text-xs font-semibold", notice.tone === "success" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-rose-100 bg-rose-50 text-rose-700", className)}>{notice.tone === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}{notice.text}</div>; }
function Empty({ icon: Icon, title, text, compact = false }: { icon: React.ElementType; title: string; text: string; compact?: boolean }) { return <div className={classNames("grid place-items-center rounded-2xl border border-dashed border-blue-200 bg-white px-6 text-center", compact ? "min-h-48 py-8" : "min-h-72 py-12")}><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><Icon className="h-5 w-5" /></span><h3 className="mt-4 text-sm font-bold text-[#07133B]">{title}</h3><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-400">{text}</p></div></div>; }
