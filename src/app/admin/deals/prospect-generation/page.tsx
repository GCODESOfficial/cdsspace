/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2, ChevronDown, ChevronUp, Chrome, Download, ExternalLink, EyeOff, Globe, Landmark, Library, Link2, Loader2,
  Mail, MapPin, Palette, Play, RefreshCw, Search, Send, Server, SlidersHorizontal, Square, Target, Trash2, TrendingUp, Users,
} from "lucide-react";
import { appConfirm } from "@/lib/app-notify";
import { DIRECTORY_TARGET, SIZE_BANDS, STOCK_EXCHANGES } from "@/lib/prospect-directory";

type Contact = { id: string; full_name: string; job_title: string | null; seniority: string; email: string | null; email_confidence: string; linkedin_url: string | null; source_url: string | null };
type Company = {
  id: string; company_name: string; domain: string | null; website: string | null; country: string | null; hq_country: string | null; city: string | null;
  country_count: number; countries: string[];
  industry: string | null; employee_range: string | null; employee_count: number | null; size_band: string | null; founded_year: number | null;
  is_public: boolean | null; stock_exchanges: string[]; ticker: string | null; is_startup: boolean | null;
  activity_status: string; activity_evidence: string | null;
  website_status: string; website_score: number | null; website_findings: string[];
  brand_consistency: Array<{ area: string; status: string; detail: string; evidence: string[] }>;
  domain_variants: Array<{ host: string; url: string; status: number | null; ok: boolean; redirectsTo: string | null; note: string }>;
  dns_contacts: Array<{ kind: string; value: string; detail: string }>;
  socials: Array<{ platform: string; url: string }>; emails: Array<{ email: string; source_url: string; kind: string }>;
  brief: string | null; pain_points: string[]; how_we_help: string[]; service_fit: Array<{ service: string; reason: string }>;
  competitors_local: Array<{ name: string; url: string; note: string }>; competitors_global: Array<{ name: string; url: string; note: string }>;
  outreach_angle: string | null; outreach_subject: string | null; outreach_email: string | null;
  deal_score: number; priority: string; sources: string[];
  enrichment_status: string; enrichment_error: string | null; review_status: string; prospect_id: string | null;
  contacts: Contact[];
};
type Totals = { total: number; queued: number; running: number; enriched: number; failed: number; active_companies: number; needs_website: number; high_priority: number; promoted: number; multi_country: number; countries_covered: number; reachable_decision_makers: number };
type Registry = { key: string; label: string; country: string | null; description: string; needsBrowser: boolean; ready: boolean; keyEnv: string | null };
type RegistryRun = { registry_key: string; id: string; cursor: any; exhausted: boolean; created_count: number; last_run_at: string | null };
type Batch = { id: string; label: string; source_kind: string; source_url: string | null; discovered_count: number; created_count: number; duplicate_count: number; created_at: string };

const EMPTY_FILTERS = {
  q: "", country: "", industry: "", size_band: "", status: "", review: "", priority: "",
  website_status: "", activity: "", is_public: "", is_startup: "", multi_country: "",
  founded_from: "", founded_to: "", staff_from: "", staff_to: "", exchange: "", letter: "",
  has_website: "", hide_inactive: "",
};

const ACTIVITY_TONE: Record<string, string> = { active: "bg-emerald-50 text-emerald-700 border-emerald-200", dormant: "bg-amber-50 text-amber-700 border-amber-200", inactive: "bg-rose-50 text-rose-700 border-rose-200", unknown: "bg-slate-50 text-slate-600 border-slate-200" };
const WEBSITE_TONE: Record<string, string> = { outdated: "bg-rose-50 text-rose-700 border-rose-200", dated: "bg-amber-50 text-amber-700 border-amber-200", modern: "bg-emerald-50 text-emerald-700 border-emerald-200", missing: "bg-rose-50 text-rose-700 border-rose-200", broken: "bg-rose-50 text-rose-700 border-rose-200", unknown: "bg-slate-50 text-slate-600 border-slate-200" };
const PRIORITY_TONE: Record<string, string> = { high: "bg-[#0A4FE8] text-white", medium: "bg-blue-50 text-[#0A4FE8]", low: "bg-slate-100 text-slate-600" };
const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
const PAGE_SIZES = [10, 50, 100, 200];

export default function ProspectGenerationPage() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [topCountries, setTopCountries] = useState<Array<{ country: string; companies: number }>>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [estimated, setEstimated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState("");
  const listRequestRef = useRef(0);
  const listAbortRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string>("");

  const [registries, setRegistries] = useState<Registry[]>([]);
  const [registryRuns, setRegistryRuns] = useState<RegistryRun[]>([]);
  const [browser, setBrowser] = useState<{ connected: boolean; hint: string }>({ connected: false, hint: "" });
  const [mode, setMode] = useState<"url" | "text" | "registry">("url");
  const [useBrowser, setUseBrowser] = useState(false);
  const [scrolls, setScrolls] = useState("12");
  const [clickSelector, setClickSelector] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [label, setLabel] = useState("");
  const [importCountry, setImportCountry] = useState("");
  const [maxPages, setMaxPages] = useState("5");

  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [sort, setSort] = useState("score");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);

  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState<string[]>([]);
  const runningRef = useRef(false);
  // The directory runs to millions, so the list defaults to a full hundred rows
  // and the size is the reader's to choose.
  const [pageSize, setPageSize] = useState(100);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    if (sort) params.set("sort", sort);
    return params.toString();
  }, [filters, sort]);

  const loadRegistries = useCallback(async () => {
    const response = await fetch("/api/admin/deals/prospect-generation?resource=registries", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return;
    setRegistries(json.registries || []); setRegistryRuns(json.runs || []); setBrowser(json.browser || { connected: false, hint: "" });
  }, []);

  const loadSummary = useCallback(async () => {
    const response = await fetch("/api/admin/deals/prospect-generation?resource=summary", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Could not load the directory.");
    setTotals(json.totals); setBatches(json.batches || []); setTopCountries(json.topCountries || []); setIndustries(json.industries || []);
  }, []);

  const loadCompanies = useCallback(async () => {
    const params = new URLSearchParams(queryString);
    params.set("resource", "companies"); params.set("limit", String(pageSize)); params.set("offset", String(page * pageSize));
    // Every list request is numbered and the previous one is abandoned, so a
    // slow answer to an earlier search can never land on top of the newer one.
    // That is what put the whole directory back on screen after a search.
    const request = ++listRequestRef.current;
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    let response: Response;
    try {
      response = await fetch(`/api/admin/deals/prospect-generation?${params}`, { cache: "no-store", signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) return;
      throw error;
    }
    const json = await response.json().catch(() => ({}));
    if (request !== listRequestRef.current) return;
    if (!response.ok) throw new Error(json.error || "Could not load companies.");
    setCompanies(json.companies || []); setTotal(json.total || 0); setEstimated(Boolean(json.estimated));
  }, [queryString, page, pageSize]);

  const refresh = useCallback(async () => {
    try { await Promise.all([loadSummary(), loadCompanies(), loadRegistries()]); }
    catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load." }); }
  }, [loadSummary, loadCompanies, loadRegistries]);

  // The summary and the registry list do not change when a filter does, so a
  // search reloads the list alone.
  useEffect(() => {
    Promise.all([loadSummary(), loadRegistries()]).catch((error) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load." }));
  }, [loadSummary, loadRegistries]);

  useEffect(() => {
    setListLoading(true);
    loadCompanies()
      .catch((error) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load companies." }))
      .finally(() => { setListLoading(false); setLoading(false); });
  }, [loadCompanies]);

  // Typing runs the search as it is typed, one short pause after the last key,
  // so a name shows its matches without waiting for a request per keystroke.
  useEffect(() => {
    if (search === filters.q) return;
    const timer = setTimeout(() => { setPage(0); setFilters((current) => ({ ...current, q: search })); }, 250);
    return () => clearTimeout(timer);
  }, [search, filters.q]);

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/admin/deals/prospect-generation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "The request could not be completed.");
    return json;
  };

  const setFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => { setPage(0); setFilters((current) => ({ ...current, [key]: value })); };

  const submitImport = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy("import"); setNotice(null);
    try {
      const json = await post({
        action: "import", source_kind: mode === "text" ? "text" : "url", source_url: sourceUrl, raw_input: rawInput,
        label, country: importCountry, max_pages: Number(maxPages) || 5,
        render: mode === "url" && useBrowser, scrolls: Number(scrolls) || 12, click_selector: clickSelector,
      });
      setSourceUrl(""); setRawInput(""); setLabel("");
      const parts = [
        `${json.created.toLocaleString()} new companies queued for research.`,
        json.merged ? `${json.merged.toLocaleString()} already in the directory were merged rather than duplicated.` : "",
        json.countriesAdded ? `${json.countriesAdded.toLocaleString()} country presence records added.` : "",
        ...(json.warnings || []),
      ].filter(Boolean);
      setNotice({ tone: "success", text: parts.join(" ") });
      await refresh();
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Import failed." }); }
    finally { setBusy(""); }
  };

  // Research runs as a chain of short requests so a directory of millions keeps
  // moving without any single request outrunning the execution limit.
  const runResearch = async () => {
    if (runningRef.current) return;
    runningRef.current = true; setRunning(true); setNotice(null); setRunLog([]);
    try {
      for (;;) {
        if (!runningRef.current) break;
        const json = await post({ action: "enrich_batch", limit: 4 });
        const lines = (json.processed || []).map((entry: any) => entry.status === "enriched"
          ? `Researched ${entry.company_name} - deal score ${entry.deal_score}`
          : `Could not research ${entry.company_name}, it will be retried`);
        if (lines.length) setRunLog((current) => [...lines, ...current].slice(0, 40));
        await refresh();
        if (!json.processed?.length || json.remaining === 0) break;
      }
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Research stopped." }); }
    finally { runningRef.current = false; setRunning(false); }
  };

  const stopResearch = () => { runningRef.current = false; setRunning(false); };

  // Registers cap how deep one query can page, so a run walks several slices and
  // stores where it stopped. Pressing it again continues from there.
  const runRegistry = async (registry: Registry) => {
    setBusy(registry.key); setNotice(null);
    try {
      const json = await post({ action: "import_registry", registry: registry.key, slices: 3 });
      setNotice({
        tone: "success",
        text: `${registry.label}: ${json.created.toLocaleString()} new companies added, ${json.merged.toLocaleString()} merged as duplicates. ${json.done ? "The register has been read to the end." : `Stopped at ${(json.notes || []).slice(-1)[0] || "the next slice"}. Run it again to continue.`}`,
      });
      await refresh();
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Registry import failed." }); }
    finally { setBusy(""); }
  };

  const act = async (id: string, body: Record<string, unknown>, successText?: string) => {
    setBusy(id);
    try { await post(body); if (successText) setNotice({ tone: "success", text: successText }); await refresh(); }
    catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The request could not be completed." }); }
    finally { setBusy(""); }
  };

  const removeCompany = async (company: Company) => {
    if (!(await appConfirm({ title: "Remove company?", message: `Remove ${company.company_name} and its research from the directory?`, confirmLabel: "Remove" }))) return;
    await act(company.id, { action: "delete_company", id: company.id }, "Company removed.");
  };

  // Every address the research turned up, decision makers first, then published
  // mailboxes, then anything traced from the domain's DNS records.
  const recipientsFor = (company: Company) => {
    const ordered = [
      ...company.contacts.filter((contact) => contact.seniority === "decision_maker" && contact.email).map((contact) => contact.email as string),
      ...company.contacts.filter((contact) => contact.seniority !== "decision_maker" && contact.email).map((contact) => contact.email as string),
      ...(company.emails || []).map((entry) => entry.email),
      ...(company.dns_contacts || []).filter((entry) => entry.value.includes("@")).map((entry) => entry.value),
    ];
    return Array.from(new Set(ordered.map((email) => email.toLowerCase())));
  };

  const composeEmail = (company: Company) => {
    const recipients = recipientsFor(company);
    if (!recipients.length) { setNotice({ tone: "error", text: `No email address was found for ${company.company_name}. Reach out through a social account instead.` }); return; }
    const subject = company.outreach_subject || `A few notes on ${company.company_name}`;
    const body = company.outreach_email || "";
    // A mailto opens whichever mail client the team already uses, with every
    // address discovered for the company already on the line.
    window.location.href = `mailto:${encodeURIComponent(recipients[0])}?cc=${encodeURIComponent(recipients.slice(1).join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const copyRecipients = async (company: Company) => {
    const recipients = recipientsFor(company);
    if (!recipients.length) { setNotice({ tone: "error", text: "No email address was found for this company." }); return; }
    try {
      await navigator.clipboard.writeText(recipients.join(", "));
      setNotice({ tone: "success", text: `${recipients.length} address${recipients.length === 1 ? "" : "es"} copied.` });
    } catch { setNotice({ tone: "error", text: "The addresses could not be copied." }); }
  };

  const progress = totals ? Math.min(100, (totals.total / DIRECTORY_TARGET) * 100) : 0;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <main className="mx-auto max-w-[1550px] p-4 sm:p-7">
      <header className="mb-6">
        <p className="text-sm font-semibold text-[#0A4FE8]">Deals</p>
        <h1 className="mt-1 text-3xl font-bold text-[#07133B]">Prospect generation</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          A worldwide company directory built from public sources. Paste a link to a company list or the raw details you already have, and every company is researched: whether it is still trading, how dated its website is, which social accounts exist, which decision makers can be reached, who it competes with locally and globally, and where CDS Space services answer its pain points. A company found in several countries stays one record and is marked as present in that many countries.
        </p>
      </header>

      {notice && <div className={`mb-5 rounded-2xl border p-4 text-sm ${notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}

      <section className="mb-6 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Target className="h-4 w-4 text-[#0A4FE8]" /> Directory progress toward {DIRECTORY_TARGET.toLocaleString()} companies worldwide</div>
            <p className="mt-1 text-3xl font-bold text-[#07133B]">{(totals?.total || 0).toLocaleString()} <span className="text-base font-semibold text-slate-400">/ {DIRECTORY_TARGET.toLocaleString()}</span></p>
            <p className="mt-1 text-xs text-slate-500">{(totals?.enriched || 0).toLocaleString()} fully researched across {(totals?.countries_covered || 0).toLocaleString()} countries</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/admin/deals/prospect-generation?resource=export&${queryString}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:border-[#0A4FE8]"><Download className="h-4 w-4" /> Export this view</a>
            <Link href="/admin/deals/prospects" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:border-[#0A4FE8]"><Users className="h-4 w-4" /> Prospect checklist</Link>
          </div>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0A4FE8] transition-all" style={{ width: `${Math.max(progress, totals?.total ? 0.4 : 0)}%` }} /></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Stat label="Awaiting research" value={totals?.queued} icon={RefreshCw} />
          <Stat label="Confirmed trading" value={totals?.active_companies} icon={TrendingUp} />
          <Stat label="Website needs work" value={totals?.needs_website} icon={Globe} />
          <Stat label="Reachable decision makers" value={totals?.reachable_decision_makers} icon={Mail} />
          <Stat label="In several countries" value={totals?.multi_country} icon={MapPin} />
          <Stat label="On the checklist" value={totals?.promoted} icon={Users} />
        </div>
      </section>

      <section className="mb-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <form onSubmit={submitImport} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="font-bold text-[#07133B]">Add companies</h2>
          <p className="mt-1 text-sm text-slate-500">A directory, registry, or listing page, its sitemap.xml, or any pasted rows of company names, websites, and notes. Duplicates are merged into the company that already exists.</p>
          <div className="mt-4 inline-flex rounded-xl border border-slate-200 p-1">
            <button type="button" onClick={() => setMode("url")} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${mode === "url" ? "bg-[#0A4FE8] text-white" : "text-slate-600"}`}><Link2 className="h-4 w-4" /> Link to a list</button>
            <button type="button" onClick={() => setMode("text")} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${mode === "text" ? "bg-[#0A4FE8] text-white" : "text-slate-600"}`}><Building2 className="h-4 w-4" /> Paste company data</button>
            <button type="button" onClick={() => setMode("registry")} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${mode === "registry" ? "bg-[#0A4FE8] text-white" : "text-slate-600"}`}><Library className="h-4 w-4" /> Official registers</button>
          </div>
          {mode === "registry" ? <div className="mt-4">
            <div className={`mb-4 flex items-start gap-2 rounded-2xl border p-3 text-xs ${browser.connected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              <Chrome className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{browser.connected ? "Your browser is connected. Registers that block automated clients can be read through it." : browser.hint}</span>
            </div>
            <ul className="space-y-3">
              {registries.map((registry) => {
                const run = registryRuns.find((entry) => entry.registry_key === registry.key);
                return <li key={registry.key} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#07133B]">{registry.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{registry.description}</p>
                      {run && <p className="mt-1.5 text-xs font-semibold text-slate-600">{run.created_count.toLocaleString()} imported so far{run.exhausted ? ", read to the end" : run.cursor ? ", resumes from where it stopped" : ""}</p>}
                      {!registry.ready && registry.keyEnv && <p className="mt-1.5 text-xs font-semibold text-amber-700">Set {registry.keyEnv} to enable this register.</p>}
                    </div>
                    <button type="button" onClick={() => runRegistry(registry)} disabled={busy === registry.key || !registry.ready || (registry.needsBrowser && !browser.connected)} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-xs font-semibold text-white disabled:opacity-50">
                      {busy === registry.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      {run?.exhausted ? "Complete" : run ? "Continue" : "Import"}
                    </button>
                  </div>
                </li>;
              })}
            </ul>
            <p className="mt-3 text-xs text-slate-400">Registers cap how deep one query can reach, so each run reads several slices and remembers where it stopped. Press continue to keep walking the register.</p>
          </div> : <><div className="mt-4 grid gap-4 sm:grid-cols-2">
            {mode === "url"
              ? <>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Link to the company list</span><input type="url" required value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://directory.example.com/members or https://example.com/sitemap.xml" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>
                <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Pages to follow</span><input type="number" min={1} max={40} value={maxPages} onChange={(event) => setMaxPages(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>
              </>
              : <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Company data</span><textarea required rows={7} value={rawInput} onChange={(event) => setRawInput(event.target.value)} placeholder={"Acme Foods, acmefoods.ng, Nigeria\nBrightline Logistics | brightline.com | freight\nZenith Manufacturing Limited\nhttps://thirdcompany.co"} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0A4FE8]" /></label>}
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Country of this list (optional)</span><input value={importCountry} onChange={(event) => setImportCountry(event.target.value)} placeholder="United Arab Emirates" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>
            <label className={mode === "url" ? "" : "sm:col-span-1"}><span className="mb-1.5 block text-xs font-semibold text-slate-600">List name (optional)</span><input value={label} onChange={(event) => setLabel(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>
          </div>
          {mode === "url" && <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <label className="flex items-start gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={useBrowser} onChange={(event) => setUseBrowser(event.target.checked)} disabled={!browser.connected} className="mt-0.5 h-4 w-4" />
              <span className="inline-flex items-center gap-2"><Chrome className="h-4 w-4 text-[#0A4FE8]" /> Read this page in my browser</span>
            </label>
            <p className="mt-1.5 pl-6 text-xs text-slate-500">{browser.connected
              ? "Opens the page in your connected Chrome, waits for it to load, and scrolls it the way a person would so lazy-loaded and infinite-scroll listings are captured."
              : browser.hint}</p>
            {useBrowser && <div className="mt-3 grid gap-3 pl-6 sm:grid-cols-2">
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Scroll steps</span><input type="number" min={0} max={60} value={scrolls} onChange={(event) => setScrolls(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Load more button (CSS selector, optional)</span><input value={clickSelector} onChange={(event) => setClickSelector(event.target.value)} placeholder=".load-more" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>
            </div>}
          </div>}
          <button disabled={busy === "import"} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-60">{busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Add and queue for research</button>
          <p className="mt-3 text-xs text-slate-400">A page that builds its list in the browser is retried through your browser automatically when one is connected.</p></>}
        </form>

        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="font-bold text-[#07133B]">Research queue</h2>
          <p className="mt-1 text-sm text-slate-500">Research runs in short passes. Keep this page open while it works through the queue.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {running
              ? <button onClick={stopResearch} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"><Square className="h-4 w-4" /> Stop after this pass</button>
              : <button onClick={runResearch} disabled={!totals?.queued} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-60"><Play className="h-4 w-4" /> Research {(totals?.queued || 0).toLocaleString()} queued</button>}
            <button onClick={() => act("requeue", { action: "requeue" }, "Failed and stalled companies were put back in the queue.")} disabled={busy === "requeue"} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:border-[#0A4FE8]">{busy === "requeue" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Retry failed</button>
          </div>
          {running && <p className="mt-3 inline-flex items-center gap-2 text-sm text-[#0A4FE8]"><Loader2 className="h-4 w-4 animate-spin" /> Researching, {(totals?.queued || 0).toLocaleString()} left in the queue</p>}
          {runLog.length > 0 && <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto text-xs text-slate-500">{runLog.map((line, index) => <li key={index}>{line}</li>)}</ul>}
          {topCountries.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-600">Countries covered</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{topCountries.slice(0, 12).map((entry) => <button key={entry.country} onClick={() => setFilter("country", entry.country)} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-blue-50 hover:text-[#0A4FE8]">{entry.country} {entry.companies.toLocaleString()}</button>)}</div>
          </div>}
          {batches.length > 0 && <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-600">Recent imports</p>
            <ul className="mt-2 space-y-2">{batches.slice(0, 4).map((batch) => <li key={batch.id} className="flex items-center justify-between gap-3 text-xs text-slate-500"><span className="truncate">{batch.label}</span><span className="shrink-0 font-semibold text-slate-600">{batch.created_count.toLocaleString()} added</span></li>)}</ul>
          </div>}
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-[#07133B]">Directory <span className="text-sm font-semibold text-slate-400">({estimated ? "about " : ""}{total.toLocaleString()})</span></h2>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, domain, industry" className="h-10 w-56 rounded-xl border border-slate-200 pl-3 pr-9 text-sm outline-none focus:border-[#0A4FE8]" />
              {listLoading && search ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" /> : null}
            </div>
            <Select value={sort} onChange={setSort} options={[["score", "Best deal score"], ["name_asc", "Name A to Z"], ["name_desc", "Name Z to A"], ["founded_new", "Newest founded"], ["founded_old", "Oldest founded"], ["staff_desc", "Most staff"], ["staff_asc", "Fewest staff"], ["countries", "Most countries"], ["newest", "Recently added"]]} />
            <Select value={String(pageSize)} onChange={(value) => { setPage(0); setPageSize(Number(value)); }} options={PAGE_SIZES.map((size) => [String(size), `${size} per page`] as [string, string])} />
            <button onClick={() => setShowFilters((current) => !current)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:border-[#0A4FE8]"><SlidersHorizontal className="h-4 w-4" /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Toggle
            active={filters.hide_inactive === "true"}
            onClick={() => setFilter("hide_inactive", filters.hide_inactive === "true" ? "" : "true")}
            icon={EyeOff}
            label="Hide inactive companies"
          />
          <Toggle
            active={filters.has_website === "true"}
            onClick={() => setFilter("has_website", filters.has_website === "true" ? "" : "true")}
            icon={Globe}
            label="Only with a website"
          />
        </div>

        <div className="mb-4 flex flex-wrap gap-1">
          <button onClick={() => setFilter("letter", "")} className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold ${filters.letter ? "text-slate-500 hover:bg-slate-100" : "bg-[#0A4FE8] text-white"}`}>All</button>
          {ALPHABET.map((letter) => <button key={letter} onClick={() => setFilter("letter", letter)} className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold uppercase ${filters.letter === letter ? "bg-[#0A4FE8] text-white" : "text-slate-500 hover:bg-slate-100"}`}>{letter}</button>)}
        </div>

        {showFilters && <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Labelled label="Country"><input list="prospect-countries" value={filters.country} onChange={(event) => setFilter("country", event.target.value)} placeholder="Any country" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8]" /></Labelled>
          <datalist id="prospect-countries">{topCountries.map((entry) => <option key={entry.country} value={entry.country} />)}</datalist>
          <Labelled label="Industry"><input list="prospect-industries" value={filters.industry} onChange={(event) => setFilter("industry", event.target.value)} placeholder="Any industry" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8]" /></Labelled>
          <datalist id="prospect-industries">{industries.map((industry) => <option key={industry} value={industry} />)}</datalist>
          <Labelled label="Company size"><Select full value={filters.size_band} onChange={(value) => setFilter("size_band", value)} options={[["", "Any size"], ...SIZE_BANDS.map((band) => [band.value, band.label] as [string, string])]} /></Labelled>
          <Labelled label="Publicly traded"><Select full value={filters.is_public} onChange={(value) => setFilter("is_public", value)} options={[["", "Listed or not"], ["true", "Publicly traded"], ["false", "Not publicly traded"]]} /></Labelled>
          <Labelled label="Stock exchange"><Select full value={filters.exchange} onChange={(value) => setFilter("exchange", value)} options={[["", "Any exchange"], ...STOCK_EXCHANGES.map((exchange) => [exchange.code, exchange.label] as [string, string])]} /></Labelled>
          <Labelled label="Startup"><Select full value={filters.is_startup} onChange={(value) => setFilter("is_startup", value)} options={[["", "Startup or not"], ["true", "Startups only"], ["false", "Established only"]]} /></Labelled>
          <Labelled label="Countries present"><Select full value={filters.multi_country} onChange={(value) => setFilter("multi_country", value)} options={[["", "Any"], ["true", "In more than one country"]]} /></Labelled>
          <Labelled label="Has a website"><Select full value={filters.has_website} onChange={(value) => setFilter("has_website", value)} options={[["", "With or without"], ["true", "Only with a website"], ["false", "Only without a website"]]} /></Labelled>
          <Labelled label="Website"><Select full value={filters.website_status} onChange={(value) => setFilter("website_status", value)} options={[["", "Any website"], ["outdated", "Outdated site"], ["dated", "Dated site"], ["missing", "No site"], ["broken", "Broken site"], ["modern", "Modern site"]]} /></Labelled>
          <Labelled label="Trading status"><Select full value={filters.activity} onChange={(value) => setFilter("activity", value)} options={[["", "Any status"], ["active", "Trading"], ["dormant", "Dormant"], ["inactive", "Not trading"], ["unknown", "Unconfirmed"]]} /></Labelled>
          <Labelled label="Priority"><Select full value={filters.priority} onChange={(value) => setFilter("priority", value)} options={[["", "Any priority"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]]} /></Labelled>
          <Labelled label="Research state"><Select full value={filters.status} onChange={(value) => setFilter("status", value)} options={[["", "Any state"], ["queued", "Queued"], ["enriched", "Researched"], ["failed", "Failed"]]} /></Labelled>
          <Labelled label="Review state"><Select full value={filters.review} onChange={(value) => setFilter("review", value)} options={[["", "Any review"], ["new", "New"], ["shortlisted", "Shortlisted"], ["promoted", "Promoted"], ["rejected", "Rejected"]]} /></Labelled>
          <Labelled label="Founded between"><div className="flex gap-2"><input type="number" value={filters.founded_from} onChange={(event) => setFilter("founded_from", event.target.value)} placeholder="From" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8]" /><input type="number" value={filters.founded_to} onChange={(event) => setFilter("founded_to", event.target.value)} placeholder="To" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8]" /></div></Labelled>
          <Labelled label="Number of staff"><div className="flex gap-2"><input type="number" value={filters.staff_from} onChange={(event) => setFilter("staff_from", event.target.value)} placeholder="Min" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8]" /><input type="number" value={filters.staff_to} onChange={(event) => setFilter("staff_to", event.target.value)} placeholder="Max" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8]" /></div></Labelled>
          <div className="flex items-end"><button onClick={() => { setPage(0); setSearch(""); setFilters({ ...EMPTY_FILTERS }); }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-[#0A4FE8]">Clear filters</button></div>
        </div>}

        {loading || (listLoading && companies.length === 0) ? <p className="inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {filters.q ? `Searching for ${filters.q}` : "Loading companies"}</p>
          : companies.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">{filters.q ? `No company matches "${filters.q}" in this view. Try clearing the filters or a shorter word.` : `No companies match this view yet. Add a list above to start building toward ${DIRECTORY_TARGET.toLocaleString()}.`}</p>
            : <ul className="space-y-3">
              {companies.map((company) => (
                <li key={company.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-[#07133B]">{company.company_name}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${PRIORITY_TONE[company.priority] || PRIORITY_TONE.low}`}>{company.deal_score} score</span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ACTIVITY_TONE[company.activity_status]}`}>{company.activity_status}</span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${WEBSITE_TONE[company.website_status]}`}>{company.website_status} website</span>
                        {company.country_count > 1 && <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#0A4FE8]"><MapPin className="h-3 w-3" /> Available in {company.country_count} countries</span>}
                        {company.is_public && <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600"><Landmark className="h-3 w-3" /> {company.stock_exchanges?.length ? `${company.stock_exchanges.join(", ")}${company.ticker ? `: ${company.ticker}` : ""}` : "Publicly traded"}</span>}
                        {company.is_startup && <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Startup</span>}
                        {company.review_status === "promoted" && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">On checklist</span>}
                        {company.enrichment_status === "queued" && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Queued</span>}
                        {company.enrichment_status === "failed" && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">Research failed</span>}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{[
                        company.industry,
                        [company.city, company.hq_country || company.country].filter(Boolean).join(", "),
                        company.employee_count ? `${company.employee_count.toLocaleString()} staff` : company.employee_range,
                        company.founded_year ? `founded ${company.founded_year}` : "",
                      ].filter(Boolean).join(" · ") || "Details pending research"}</p>
                      {company.website && <a href={company.website} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#0A4FE8]">{company.domain} <ExternalLink className="h-3 w-3" /></a>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {company.enrichment_status === "enriched" && !company.prospect_id && <button onClick={() => act(company.id, { action: "promote", id: company.id }, `${company.company_name} was added to the prospect checklist.`)} disabled={busy === company.id} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-[#0A4FE8] px-3 text-xs font-semibold text-white disabled:opacity-60">{busy === company.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />} Add to checklist</button>}
                      <button onClick={() => act(company.id, { action: "update_company", id: company.id, review_status: company.review_status === "shortlisted" ? "new" : "shortlisted" })} className="min-h-9 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-[#0A4FE8]">{company.review_status === "shortlisted" ? "Shortlisted" : "Shortlist"}</button>
                      <button onClick={() => setExpanded(expanded === company.id ? "" : company.id)} className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-[#0A4FE8]">{expanded === company.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Details</button>
                      <button onClick={() => removeCompany(company)} className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-rose-600 hover:border-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>

                  {expanded === company.id && <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2">
                    <Block title="Brief">{company.brief || "Not researched yet."}</Block>
                    <Block title="Still trading?">{company.activity_evidence || "Not confirmed."}</Block>
                    {company.countries?.length > 0 && <Block title={`Present in ${company.countries.length} ${company.countries.length === 1 ? "country" : "countries"}`}>{company.countries.join(", ")}</Block>}
                    <ListBlock title="Website findings" items={company.website_findings} suffix={company.website_score !== null ? `Website score ${company.website_score} out of 100` : ""} />
                    <ListBlock title="Pain points" items={company.pain_points} />
                    <ListBlock title="How CDS Space helps" items={company.how_we_help} />
                    <ListBlock title="Service fit" items={(company.service_fit || []).map((entry) => `${entry.service}: ${entry.reason}`)} />
                    <div>
                      <p className="text-xs font-semibold text-slate-600">Key decision makers</p>
                      {company.contacts.length === 0 ? <p className="mt-1 text-sm text-slate-500">No named contacts were found on public pages.</p>
                        : <ul className="mt-2 space-y-2">{company.contacts.map((contact) => <li key={contact.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                          <p className="font-semibold text-[#07133B]">{contact.full_name} <span className="text-xs font-normal text-slate-500">{contact.job_title || ""}</span></p>
                          <p className="mt-0.5 text-xs text-slate-500">{contact.seniority.replace("_", " ")}{contact.email ? ` · ${contact.email}` : " · no public email"}</p>
                          {contact.source_url && <a href={contact.source_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-[#0A4FE8]">Source <ExternalLink className="h-3 w-3" /></a>}
                        </li>)}</ul>}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-600">Emails and social accounts</p>
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        {(company.emails || []).map((entry) => <li key={entry.email}>{entry.email} <span className="text-xs text-slate-400">({entry.kind})</span></li>)}
                        {(company.socials || []).map((entry) => <li key={entry.url}><a href={entry.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0A4FE8]">{entry.platform}</a></li>)}
                        {!company.emails?.length && !company.socials?.length && <li className="text-slate-500">None found publicly.</li>}
                      </ul>
                    </div>
                    {company.brand_consistency?.length > 0 && <div>
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Palette className="h-3.5 w-3.5 text-[#0A4FE8]" /> Brand consistency, website against social</p>
                      <ul className="mt-2 space-y-2">{company.brand_consistency.map((entry, index) => <li key={index} className="rounded-xl bg-slate-50 p-3 text-sm">
                        <p className="font-semibold text-[#07133B]">{entry.area} <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] ${entry.status === "consistent" ? "bg-emerald-50 text-emerald-700" : entry.status === "differs" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{entry.status}</span></p>
                        <p className="mt-1 text-slate-600">{entry.detail}</p>
                        {entry.evidence?.length > 0 && <p className="mt-1 flex flex-wrap gap-2">{entry.evidence.map((link) => <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#0A4FE8]">view</a>)}</p>}
                      </li>)}</ul>
                    </div>}
                    {company.domain_variants?.length > 0 && <div>
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Server className="h-3.5 w-3.5 text-[#0A4FE8]" /> Domain configuration</p>
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">{company.domain_variants.map((entry) => <li key={entry.host}>
                        <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${entry.ok ? "bg-emerald-500" : "bg-rose-500"}`} />
                        <span className="font-semibold text-[#07133B]">{entry.host}</span> {entry.note}
                      </li>)}</ul>
                      {(company.dns_contacts || []).length > 0 && <ul className="mt-2 space-y-1 text-sm text-slate-600">{company.dns_contacts.map((entry, index) => <li key={index}><span className="font-semibold text-[#07133B]">{entry.value}</span> {entry.detail}</li>)}</ul>}
                    </div>}
                    <ListBlock title="Local competitors" items={(company.competitors_local || []).map((entry) => `${entry.name}${entry.note ? `: ${entry.note}` : ""}`)} />
                    <ListBlock title="Global competitors" items={(company.competitors_global || []).map((entry) => `${entry.name}${entry.note ? `: ${entry.note}` : ""}`)} />
                    {company.outreach_email && <div className="lg:col-span-2">
                      <p className="text-xs font-semibold text-slate-600">Suggested first email{company.outreach_subject ? ` - ${company.outreach_subject}` : ""}</p>
                      <p className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{company.outreach_email}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button onClick={() => composeEmail(company)} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-[#0A4FE8] px-3 text-xs font-semibold text-white"><Send className="h-3.5 w-3.5" /> Compose email</button>
                        <button onClick={() => copyRecipients(company)} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-[#0A4FE8]"><Mail className="h-3.5 w-3.5" /> Copy recipients</button>
                        <span className="text-xs text-slate-500">{recipientsFor(company).length} address{recipientsFor(company).length === 1 ? "" : "es"} found: {recipientsFor(company).join(", ") || "none"}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">Review every claim against the sources before sending.</p>
                    </div>}
                    {company.sources?.length > 0 && <div className="lg:col-span-2">
                      <p className="text-xs font-semibold text-slate-600">Sources</p>
                      <ul className="mt-1 space-y-0.5">{company.sources.slice(0, 12).map((source) => <li key={source}><a href={source} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0A4FE8] break-all">{source}</a></li>)}</ul>
                    </div>}
                    {company.enrichment_error && <p className="text-xs text-rose-600 lg:col-span-2">Last research error: {company.enrichment_error}</p>}
                  </div>}
                </li>
              ))}
            </ul>}

        {total > pageSize && <div className="mt-5 flex items-center justify-between gap-3 text-sm">
          <button onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} className="min-h-10 rounded-xl border border-slate-200 px-4 font-semibold text-slate-700 disabled:opacity-50">Previous</button>
          <span className="text-slate-500">Page {(page + 1).toLocaleString()} of {Math.ceil(total / pageSize).toLocaleString()}{estimated ? " (estimated)" : ""}</span>
          <button onClick={() => setPage((current) => current + 1)} disabled={(page + 1) * pageSize >= total} className="min-h-10 rounded-xl border border-slate-200 px-4 font-semibold text-slate-700 disabled:opacity-50">Next</button>
        </div>}
      </section>
    </main>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number | undefined; icon: React.ComponentType<{ className?: string }> }) {
  return <div className="rounded-2xl border border-slate-200 p-4">
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Icon className="h-4 w-4 text-[#0A4FE8]" /> {label}</div>
    <p className="mt-1.5 text-2xl font-bold text-[#07133B]">{(value || 0).toLocaleString()}</p>
  </div>;
}

function Toggle({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return <button
    onClick={onClick}
    aria-pressed={active}
    className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${active ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-slate-200 text-slate-700 hover:border-[#0A4FE8]"}`}
  >
    <Icon className="h-4 w-4" /> {label}
  </button>;
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>;
}

function Select({ value, onChange, options, full }: { value: string; onChange: (value: string) => void; options: Array<[string, string]>; full?: boolean }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className={`h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8] ${full ? "w-full" : ""}`}>
    {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
  </select>;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="text-xs font-semibold text-slate-600">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{children}</p></div>;
}

function ListBlock({ title, items, suffix }: { title: string; items: string[]; suffix?: string }) {
  return <div>
    <p className="text-xs font-semibold text-slate-600">{title}</p>
    {items?.length ? <ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-6 text-slate-600">{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="mt-1 text-sm text-slate-500">Nothing recorded.</p>}
    {suffix && <p className="mt-1 text-xs text-slate-400">{suffix}</p>}
  </div>;
}
