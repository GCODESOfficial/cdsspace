/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowDownWideNarrow, ArrowUpNarrowWide, Bookmark, Building2, ChevronDown, ChevronUp, Chrome, ClipboardCheck, Download, ExternalLink, EyeOff, FileText, Globe, Landmark, Library, Link2, Loader2,
  Mail, MapPin, MonitorSmartphone, Palette, Play, Plus, RefreshCw, Search, Send, Share2, SlidersHorizontal, Square, Target, Trash2, TrendingUp, Users, X,
} from "lucide-react";
import { appConfirm } from "@/lib/app-notify";
import { DIRECTORY_TARGET, SIZE_BANDS, STOCK_EXCHANGES } from "@/lib/prospect-directory";
import { PROSPECT_ISSUES, issueLabel } from "@/lib/prospect-issues";
import { ACTIVITY_TONE, PRIORITY_TONE, ProspectResearchPanel, WEBSITE_TONE, type ProspectResearch } from "@/components/deals/ProspectResearchPanel";
import { ProposalPreviewModal } from "@/components/deals/ProposalPreviewModal";
import { FirstEmailComposer } from "@/components/deals/FirstEmailComposer";

type Company = ProspectResearch;
type Totals = { total: number; queued: number; running: number; enriched: number; failed: number; active_companies: number; needs_website: number; high_priority: number; promoted: number; multi_country: number; countries_covered: number; reachable_decision_makers: number; issue_outdated_website: number; issue_poor_branding: number; issue_non_responsive: number; issue_poor_social_design: number };
type Registry = { key: string; label: string; country: string | null; description: string; needsBrowser: boolean; ready: boolean; keyEnv: string | null };
type RegistryRun = { registry_key: string; id: string; cursor: any; exhausted: boolean; created_count: number; last_run_at: string | null };
type Batch = { id: string; label: string; source_kind: string; source_url: string | null; discovered_count: number; created_count: number; duplicate_count: number; created_at: string };

const EMPTY_FILTERS = {
  q: "", country: "", industry: "", size_band: "", status: "", review: "", priority: "",
  website_status: "", activity: "", is_public: "", is_startup: "", multi_country: "",
  founded_from: "", founded_to: "", staff_from: "", staff_to: "", exchange: "", letter: "",
  has_website: "", hide_inactive: "", issues: "", issues_any: "", reachable_decision_maker: "",
  score_from: "", score_to: "",
};

// What the deal score is made of, so the number on a card can be read rather
// than guessed. Kept in step with scoreDeal() in src/lib/prospect-enrichment.ts.
const SCORE_METRIC = [
  "Website condition, up to 35: outdated 35, dated 25, missing or broken 20, modern 8",
  "Trading status, up to 25: trading 25, dormant 8, not trading -15",
  "Decision makers found, up to 20: 10 each",
  "A way to reach them, up to 10: a decision maker with an email 10, any email 5",
  "Social presence, up to 10: two or more 10, one 5",
];
// The split sits on the same line the priority badge uses, so "below" is every
// low-priority company and "above" is everything we would actually call.
const SCORE_SPLIT = 45;
/** Filter views held in memory so revisiting one costs nothing. */
const LIST_CACHE_LIMIT = 40;

/**
 * A filter stays applied until it is cleared: across a refresh, a visit to
 * another page and back, and a return from a company's audit or proposal.
 * The address carries the view so it can be shared; the browser keeps the
 * last one for when the page is opened from the menu.
 */
const VIEW_STORAGE_KEY = "cds.prospect-directory.view";
const VIEW_PARAMS = ["sort", "size"] as const;

const FILTER_LABELS: Record<keyof typeof EMPTY_FILTERS, string> = {
  q: "Search", country: "Country", industry: "Industry", size_band: "Company size", status: "Research state", review: "Review state",
  priority: "Priority", website_status: "Website", activity: "Trading status", is_public: "Publicly traded", is_startup: "Startup",
  multi_country: "More than one country", founded_from: "Founded from", founded_to: "Founded to", staff_from: "Staff from", staff_to: "Staff to",
  exchange: "Stock exchange", letter: "Starts with", has_website: "Has a website", hide_inactive: "Hide inactive companies",
  issues: "Issues", issues_any: "Issue theme", reachable_decision_maker: "Reachable decision maker", score_from: "Deal score from", score_to: "Deal score to",
};

function filterChipText(key: keyof typeof EMPTY_FILTERS, value: string) {
  if (key === "issues") return `Issues: ${value.split(",").filter(Boolean).map(issueLabel).join(", ")}`;
  if (value === "true") return FILTER_LABELS[key];
  if (value === "false") return `${FILTER_LABELS[key]}: no`;
  return `${FILTER_LABELS[key]}: ${value.replace(/_/g, " ")}`;
}
const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
const PAGE_SIZES = [10, 50, 100, 200];
type DirectoryLoad = "summary" | "companies" | "registries";

function directoryErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return "";
  if (error instanceof TypeError || (error instanceof Error && error.message === "Failed to fetch")) {
    return "The directory connection was interrupted. Please try again.";
  }
  return error instanceof Error ? error.message : "The directory could not be loaded.";
}

/** Retry only safe directory reads when the host or connection drops briefly. */
async function getDirectoryJson(url: string, signal?: AbortSignal) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store", signal });
      const json = await response.json().catch(() => ({}));
      if (response.ok) return json;
      const error = new Error(json.error || "The directory could not be loaded.");
      if (![502, 503, 504].includes(response.status) || attempt === 1) throw error;
      lastError = error;
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      lastError = error;
      if (attempt === 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError instanceof Error ? lastError : new Error("The directory could not be loaded.");
}

export default function ProspectGenerationPage() {
  const router = useRouter();
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
  const listCacheRef = useRef(new Map<string, { companies: Company[]; total: number; estimated: boolean }>());
  const detailsRef = useRef<Record<string, Company>>({});
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [loadErrors, setLoadErrors] = useState<Partial<Record<DirectoryLoad, string>>>({});
  const [expanded, setExpanded] = useState<string>("");
  // Full research records, keyed by company, fetched only when asked for.
  const [details, setDetails] = useState<Record<string, Company>>({});
  const [composeCompany, setComposeCompany] = useState<Company | null>(null);

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
  // The list waits for the saved view to be read, so it never flashes the
  // unfiltered directory first.
  const [viewRestored, setViewRestored] = useState(false);
  const [proposalCompany, setProposalCompany] = useState<Company | null>(null);
  const [autoCompose, setAutoCompose] = useState<Company | null>(null);
  const proposalSource = useMemo(() => proposalCompany ? { company_id: proposalCompany.id } : null, [proposalCompany]);
  const [sort, setSort] = useState("score");
  // The directory is what this screen is for, so the setup panels start out of
  // the way. The choice is remembered per browser.
  const [setupOpen, setSetupOpen] = useState(false);
  const [serverRun, setServerRun] = useState<{ processedTotal: number; startedByName: string | null; startedAt: string; endsAt?: string } | null>(null);
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

  const clearLoadError = useCallback((area: DirectoryLoad) => {
    setLoadErrors((current) => {
      if (!current[area]) return current;
      const next = { ...current };
      delete next[area];
      return next;
    });
  }, []);

  const recordLoadError = useCallback((area: DirectoryLoad, error: unknown) => {
    const message = directoryErrorMessage(error);
    if (message) setLoadErrors((current) => ({ ...current, [area]: message }));
  }, []);

  const loadRegistries = useCallback(async () => {
    const json = await getDirectoryJson("/api/admin/deals/prospect-generation?resource=registries");
    setRegistries(json.registries || []); setRegistryRuns(json.runs || []); setBrowser(json.browser || { connected: false, hint: "" });
    clearLoadError("registries");
  }, [clearLoadError]);

  const loadSummary = useCallback(async () => {
    const json = await getDirectoryJson("/api/admin/deals/prospect-generation?resource=summary");
    setTotals(json.totals); setBatches(json.batches || []); setTopCountries(json.topCountries || []); setIndustries(json.industries || []);
    clearLoadError("summary");
  }, [clearLoadError]);

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
    let json: any;
    try {
      json = await getDirectoryJson(`/api/admin/deals/prospect-generation?${params}`, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      throw error;
    }
    if (request !== listRequestRef.current) return;
    const view = { companies: json.companies || [], total: json.total || 0, estimated: Boolean(json.estimated) };
    // Remember this view so turning a filter back off, or stepping back a page,
    // is instant instead of another wait on the network.
    const cache = listCacheRef.current;
    cache.set(params.toString(), view);
    if (cache.size > LIST_CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    setCompanies(view.companies); setTotal(view.total); setEstimated(view.estimated);
    clearLoadError("companies");
  }, [queryString, page, pageSize, clearLoadError]);

  /**
   * The company in full. A list row holds only what it displays, so anything
   * reading the research - the expanded panel, the composer, an audit - asks
   * for the rest here first. Already-fetched records are returned as they are.
   */
  const ensureDetail = useCallback(async (company: Company): Promise<Company> => {
    const held = detailsRef.current[company.id];
    if (held) return held;
    const response = await fetch(`/api/admin/deals/prospect-generation?resource=company&id=${company.id}`, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Could not load this company.");
    const full = { ...company, ...json.company } as Company;
    detailsRef.current[company.id] = full;
    setDetails((current) => ({ ...current, [company.id]: full }));
    return full;
  }, []);

  // A pipeline timeline links back to the exact research record that created
  // its checklist entry. Fetch that record directly, narrow the directory to
  // it and open its details without depending on which result page it was on.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("company")?.trim() || "";
    // The checklist links here with compose=1 to write that company's first email.
    const wantsCompose = new URLSearchParams(window.location.search).get("compose") === "1";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requested)) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/admin/deals/prospect-generation?resource=company&id=${requested}`, { cache: "no-store" });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "Could not load this company.");
        if (cancelled) return;

        const company = json.company as Company;
        detailsRef.current[company.id] = company;
        setDetails((current) => ({ ...current, [company.id]: company }));
        setCompanies((current) => current.some((entry) => entry.id === company.id)
          ? current.map((entry) => entry.id === company.id ? { ...entry, ...company } : entry)
          : [company, ...current]);
        setExpanded(company.id);
        setPage(0);
        setSearch(company.company_name);
        setFilters((current) => ({ ...current, q: company.company_name }));
        if (wantsCompose) {
          setAutoCompose(company);
          const params = new URLSearchParams(window.location.search);
          params.delete("compose");
          window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params.toString()}`);
        }
        window.requestAnimationFrame(() => {
          document.getElementById(`prospect-company-${company.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } catch (error) {
        if (!cancelled) setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load this company." });
      }
    })();

    return () => { cancelled = true; };
  }, []);

  /** The view for this exact filter set if it has already been fetched. */
  const cachedView = useCallback(() => {
    const params = new URLSearchParams(queryString);
    params.set("resource", "companies"); params.set("limit", String(pageSize)); params.set("offset", String(page * pageSize));
    return listCacheRef.current.get(params.toString());
  }, [queryString, page, pageSize]);

  const refresh = useCallback(async () => {
    // Research, promotion or removal changes the rows themselves, so every
    // remembered view and every held research record is stale.
    listCacheRef.current.clear();
    detailsRef.current = {};
    setDetails({});
    const results = await Promise.allSettled([loadSummary(), loadCompanies(), loadRegistries()]);
    const areas: DirectoryLoad[] = ["summary", "companies", "registries"];
    results.forEach((result, index) => {
      if (result.status === "rejected") recordLoadError(areas[index], result.reason);
    });
  }, [loadSummary, loadCompanies, loadRegistries, recordLoadError]);

  useEffect(() => {
    let saved: Record<string, string> = {};
    const fromAddress = new URLSearchParams(window.location.search);
    const known = [...Object.keys(EMPTY_FILTERS), ...VIEW_PARAMS];
    if (known.some((key) => fromAddress.has(key))) {
      for (const key of known) { const value = fromAddress.get(key); if (value) saved[key] = value; }
    } else {
      try { saved = JSON.parse(window.localStorage.getItem(VIEW_STORAGE_KEY) || "{}") || {}; } catch { saved = {}; }
    }
    const next = { ...EMPTY_FILTERS };
    for (const key of Object.keys(EMPTY_FILTERS) as Array<keyof typeof EMPTY_FILTERS>) {
      if (typeof saved[key] === "string") next[key] = saved[key];
    }
    setFilters(next);
    setSearch(next.q);
    if (typeof saved.sort === "string" && saved.sort) setSort(saved.sort);
    const size = Number(saved.size);
    if (PAGE_SIZES.includes(size)) setPageSize(size);
    setViewRestored(true);
  }, []);

  useEffect(() => {
    if (!viewRestored) return;
    const view: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) if (value) view[key] = value;
    if (sort && sort !== "score") view.sort = sort;
    if (pageSize !== 100) view.size = String(pageSize);
    try { window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view)); } catch { /* private mode: the address still holds it */ }
    const params = new URLSearchParams(window.location.search);
    for (const key of [...Object.keys(EMPTY_FILTERS), ...VIEW_PARAMS]) params.delete(key);
    for (const [key, value] of Object.entries(view)) params.set(key, value);
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [filters, sort, pageSize, viewRestored]);

  // The summary and the registry list do not change when a filter does, so a
  // search reloads the list alone.
  useEffect(() => {
    void loadSummary().catch((error) => recordLoadError("summary", error));
    void loadRegistries().catch((error) => recordLoadError("registries", error));
  }, [loadSummary, loadRegistries, recordLoadError]);

  // A filter change paints in the same frame it is clicked. A view already
  // fetched comes straight back from memory; anything else keeps the previous
  // list on screen, marked as updating, rather than leaving the page looking
  // like the click did nothing until the network answers.
  useEffect(() => {
    if (!viewRestored) return;
    const cached = cachedView();
    if (cached) {
      setCompanies(cached.companies); setTotal(cached.total); setEstimated(cached.estimated);
      clearLoadError("companies");
      setListLoading(false); setLoading(false);
      return;
    }
    setListLoading(true);
    loadCompanies()
      .catch((error) => recordLoadError("companies", error))
      .finally(() => { setListLoading(false); setLoading(false); });
  }, [loadCompanies, cachedView, clearLoadError, recordLoadError, viewRestored]);

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

  const activeIssues = filters.issues ? filters.issues.split(",").filter(Boolean) : [];
  const toggleIssue = (key: string) => {
    const next = activeIssues.includes(key) ? activeIssues.filter((entry) => entry !== key) : [...activeIssues, key];
    setFilter("issues", next.join(","));
  };

  // The score filter is a band with two independent ends, so one set of state
  // serves "below 50", "50 and above" and "everyone on exactly this score".
  const setScoreBand = (from: string, to: string) => {
    setPage(0);
    setFilters((current) => ({ ...current, score_from: from, score_to: to }));
  };
  const scoreBand = filters.score_from === "" && filters.score_to === String(SCORE_SPLIT - 1) ? "below"
    : filters.score_from === String(SCORE_SPLIT) && filters.score_to === "" ? "above"
      : filters.score_from && filters.score_from === filters.score_to ? "exact" : "";

  /**
   * A summary card is a saved view of the list below it. Clicking one adds its
   * filters to the ones already set; filters stay applied until cleared, so a
   * card never silently undoes them. Clicking the same card again removes only
   * what that card added.
   */
  const applyCardView = (view: Partial<typeof EMPTY_FILTERS>) => {
    setPage(0);
    const keys = Object.keys(view) as Array<keyof typeof EMPTY_FILTERS>;
    const applied = keys.length > 0 && keys.every((key) => filters[key] === view[key]);
    setFilters((current) => {
      const next = { ...current };
      for (const key of keys) next[key] = applied ? "" : (view[key] ?? "");
      return next;
    });
    if (typeof document !== "undefined") document.getElementById("prospect-directory")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
    // The server owns the run from here, so closing this page no longer stops
    // the work. While the page is open it also helps, which makes it quicker.
    await post({ action: "start_research" }).catch(() => undefined);
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

  /**
   * Puts every failed company back at the front of the queue. It works while
   * a run is going - the run picks them up on its next pass - and starts one
   * when nothing is running, so a retry always leads to research.
   */
  const [retrying, setRetrying] = useState(false);
  const retryFailed = async () => {
    setRetrying(true);
    try {
      const json = await post({ action: "requeue" });
      const count = Number(json.requeued || 0);
      const alreadyRunning = runningRef.current || running;
      if (!alreadyRunning) void runResearch();
      setNotice({
        tone: "success",
        text: `${count ? `${count.toLocaleString()} failed ${count === 1 ? "company was" : "companies were"} put` : "Companies that failed earlier are"} at the front of the research queue. ${alreadyRunning ? "The research already running takes them next." : "Research has started."}`,
      });
      if (alreadyRunning) void refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "The failed companies could not be retried." });
    } finally {
      setRetrying(false);
    }
  };

  const stopResearch = async () => {
    runningRef.current = false;
    setRunning(false);
    // Stop it on the server too, otherwise it would carry on without the page.
    await post({ action: "stop_research" }).catch(() => undefined);
    await refresh();
  };

  // A run started earlier, perhaps from another machine, is still going: the
  // page should show that rather than offering to start a second one.
  useEffect(() => {
    let active = true;
    const check = async () => {
      const json = await post({ action: "research_status" }).catch(() => null);
      if (!active) return;
      const serverRunning = Boolean(json?.run);
      setServerRun(json?.run || null);
      if (serverRunning && !runningRef.current) setRunning(true);
      if (!serverRunning && !runningRef.current) setRunning(false);
    };
    void check();
    const timer = window.setInterval(() => void check(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /**
   * A brand audit for a company straight from the directory. The research and
   * the write-up run server side and take a moment, so the row shows it working
   * and then opens the finished report automatically.
   */
  const runAudit = async (listCompany: Company) => {
    if (!listCompany.website) {
      setNotice({ tone: "error", text: `${listCompany.company_name} has no public website to audit.` });
      return;
    }
    setBusy(`audit:${listCompany.id}`);
    setNotice({ tone: "success", text: `Auditing ${listCompany.company_name} across every brand touchpoint. This takes a moment.` });
    try {
      // The social account the audit compares against lives in the research.
      const company = await ensureDetail(listCompany);
      const response = await fetch("/api/admin/deals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_audit", company_id: company.id, brand_name: company.company_name,
          target_url: company.website, social_url: company.socials?.[0]?.url || "",
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "The brand audit could not be generated.");
      const auditId = typeof json.audit?.id === "string" ? json.audit.id : "";
      if (!auditId) throw new Error("The audit finished without a report ID.");
      router.push(`/admin/deals/brand-audits?audit=${encodeURIComponent(auditId)}`);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "The brand audit could not be generated." });
    } finally { setBusy(""); }
  };

  /**
   * A proposal straight from the directory. The server reads the brand, the
   * site and what the work is about off the researched record, so nothing is
   * retyped; the deck is still ours to edit before it goes anywhere.
   */
  // A proposal opens on what it will be written from, so it can be checked first.
  const draftProposal = (listCompany: Company) => {
    if (!listCompany.website) {
      setNotice({ tone: "error", text: `${listCompany.company_name} has no public website to build a proposal from.` });
      return;
    }
    setProposalCompany(listCompany);
  };

  /**
   * Shortlisting shows at once. The row is marked before the request is sent
   * and only reverts if the server refuses; the answer then fills in the
   * checklist link the server created.
   */
  const toggleShortlist = async (company: Company) => {
    const before = { review_status: company.review_status, prospect_id: company.prospect_id };
    const shortlisting = company.review_status !== "shortlisted";
    const patchRow = (patch: Partial<Company>) => {
      setCompanies((rows) => rows.map((row) => row.id === company.id ? { ...row, ...patch } : row));
      if (detailsRef.current[company.id]) {
        detailsRef.current[company.id] = { ...detailsRef.current[company.id], ...patch };
        setDetails((current) => ({ ...current, [company.id]: detailsRef.current[company.id] }));
      }
    };
    patchRow({ review_status: shortlisting ? "shortlisted" : "new" });
    try {
      const json = await post({ action: "update_company", id: company.id, review_status: shortlisting ? "shortlisted" : "new" });
      const saved = json.company || {};
      patchRow({ review_status: saved.review_status ?? (shortlisting ? "shortlisted" : "new"), prospect_id: saved.prospect_id ?? before.prospect_id });
      // Remembered views no longer match this row, and the totals have moved.
      listCacheRef.current.clear();
      void loadSummary().catch(() => undefined);
      if (shortlisting) {
        setNotice({
          tone: "success",
          text: saved.prospect_id
            ? `${company.company_name} was shortlisted and added to the prospect checklist with its research.`
            : `${company.company_name} was shortlisted. It joins the prospect checklist once its research finishes.`,
        });
      }
    } catch (error) {
      patchRow(before);
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "The shortlist could not be updated." });
    }
  };

  const removeCompany = async (company: Company) => {
    if (!(await appConfirm({ title: "Remove company?", message: `Remove ${company.company_name} and its research from the directory?`, confirmLabel: "Remove" }))) return;
    await act(company.id, { action: "delete_company", id: company.id }, "Company removed.");
  };

  const refreshCompetitors = async (company: Company) => {
    const busyKey = `competitors:${company.id}`;
    setBusy(busyKey); setNotice(null);
    try {
      await post({ action: "requeue", id: company.id });
      const json = await post({ action: "enrich_batch", id: company.id, limit: 1 });
      const result = json.processed?.find((entry: { id: string }) => entry.id === company.id);
      if (!result || result.status !== "enriched") throw new Error("Competitor research was queued but did not finish. Run the research queue to retry it.");
      setNotice({ tone: "success", text: `${company.company_name}'s direct and indirect competitors were refreshed.` });
      await refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Competitor research could not be refreshed." });
    } finally { setBusy(""); }
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

  // Opening the composer is never blocked by having no address: an empty
  // recipient list is the normal starting point for a company nobody has
  // reached yet, and the composer is where an address gets found or typed in.
  const composeEmail = async (listCompany: Company) => {
    setBusy(`compose:${listCompany.id}`);
    try { setComposeCompany(await ensureDetail(listCompany)); }
    catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load this company." }); }
    finally { setBusy(""); }
  };

  // Opens the composer for a company handed over from the checklist.
  useEffect(() => {
    if (!autoCompose) return;
    setAutoCompose(null);
    void composeEmail(autoCompose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCompose]);

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
  const directoryError = Object.values(loadErrors)[0];

  return (
    <main className="mx-auto max-w-[1550px] p-4 sm:p-7">
      <header className="mb-6">
        <p className="text-sm font-semibold text-[#0A4FE8]">Deals</p>
        <h1 className="mt-1 text-3xl font-bold text-[#07133B]">Prospect generation</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          A worldwide company directory built from public sources. Paste a link to a company list or the raw details you already have, and every company is researched: whether it is still trading, how dated its website is, which social accounts exist, which decision makers can be reached, who it competes with locally and globally, and where CDS Space services answer its pain points. A company found in several countries stays one record and is marked as present in that many countries.
        </p>
      </header>

      {directoryError && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        <span>{directoryError}</span>
        <button type="button" onClick={() => void refresh()} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 font-semibold hover:border-rose-300">
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>}
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
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Stat label="Awaiting research" value={totals?.queued} icon={RefreshCw} onClick={() => applyCardView({ status: "queued" })} />
          <Stat label="Outdated website" value={totals?.issue_outdated_website} icon={Globe} onClick={() => applyCardView({ issues_any: "outdated_website" })} />
          <Stat label="Poor branding" value={totals?.issue_poor_branding} icon={Palette} onClick={() => applyCardView({ issues_any: "poor_branding,inconsistent_communications" })} />
          <Stat label="Non-responsive website" value={totals?.issue_non_responsive} icon={MonitorSmartphone} onClick={() => applyCardView({ issues_any: "non_responsive_website" })} />
          <Stat label="Poor social media designs" value={totals?.issue_poor_social_design} icon={Share2} onClick={() => applyCardView({ issues_any: "poor_social_design" })} />
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const next = !setupOpen;
            setSetupOpen(next);
            try { window.localStorage.setItem("cds.prospect-setup-open", next ? "1" : "0"); } catch { /* a blocked store only costs the memory of this choice */ }
          }}
          aria-expanded={setupOpen}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-[#0A4FE8] hover:text-[#0A4FE8]"
        >
          {setupOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {setupOpen ? "Hide add companies and research queue" : "Add companies and research queue"}
        </button>
        {!setupOpen && (totals?.queued || 0) > 0 && (
          <span className="text-xs text-slate-500">{(totals?.queued || 0).toLocaleString()} queued for research</span>
        )}
        {running && <span className="text-xs font-semibold text-[#0A4FE8]">Research is running in the background, so it keeps going while this is hidden.</span>}
      </div>

      {setupOpen && (
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
          <p className="mt-1 text-sm text-slate-500">Research runs in short passes on the server. It keeps going if you leave this page, until you stop it, sign out of the admin panel, or it reaches four hours.</p>
          {serverRun && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-[#0A4FE8]">
              Running in the background{serverRun.startedByName ? `, started by ${serverRun.startedByName}` : ""}
              {serverRun.processedTotal > 0 ? ` · ${serverRun.processedTotal.toLocaleString()} researched so far` : ""}
              {serverRun.endsAt ? ` · stops by ${new Date(serverRun.endsAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {running
              ? <button onClick={stopResearch} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"><Square className="h-4 w-4" /> Stop after this pass</button>
              : <button onClick={runResearch} disabled={!totals?.queued} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-60"><Play className="h-4 w-4" /> Research {(totals?.queued || 0).toLocaleString()} queued</button>}
            <button onClick={() => void retryFailed()} disabled={retrying} title="Put failed companies at the front of the queue. Works while research is running." className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:border-[#0A4FE8]">{retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Retry failed{totals?.failed ? ` (${totals.failed.toLocaleString()})` : ""}</button>
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
      )}

      <section id="prospect-directory" className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-[#07133B]">Directory <span className="text-sm font-semibold text-slate-400">({estimated ? "about " : ""}{total.toLocaleString()})</span>
            {listLoading && companies.length > 0 && <span className="ms-2 inline-flex items-center gap-1.5 align-middle text-xs font-semibold text-[#0A4FE8]"><Loader2 className="h-3 w-3 animate-spin" /> Updating</span>}
          </h2>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, domain, industry" className="h-10 w-56 rounded-xl border border-slate-200 pl-3 pr-9 text-sm outline-none focus:border-[#0A4FE8]" />
              {listLoading && search ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" /> : null}
            </div>
            <Select value={sort} onChange={setSort} options={[["score", "Deal score, highest first"], ["score_asc", "Deal score, lowest first"], ["name_asc", "Name A to Z"], ["name_desc", "Name Z to A"], ["founded_new", "Newest founded"], ["founded_old", "Oldest founded"], ["staff_desc", "Most staff"], ["staff_asc", "Fewest staff"], ["countries", "Most countries"], ["newest", "Recently added"]]} />
            <Select value={String(pageSize)} onChange={(value) => { setPage(0); setPageSize(Number(value)); }} options={PAGE_SIZES.map((size) => [String(size), `${size} per page`] as [string, string])} />
            <button onClick={() => setShowFilters((current) => !current)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:border-[#0A4FE8]"><SlidersHorizontal className="h-4 w-4" /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>
          </div>
        </div>

        {/* Every applied filter, held until it is removed here or cleared. */}
        {activeFilterCount > 0 && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
          <span className="text-xs font-semibold text-[#07133B]">Applied filters</span>
          {(Object.keys(EMPTY_FILTERS) as Array<keyof typeof EMPTY_FILTERS>).filter((key) => filters[key]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => { setFilter(key, ""); if (key === "q") setSearch(""); }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0A4FE8] py-1 pl-3 pr-2 text-xs font-semibold text-white hover:bg-[#0846cf]"
              title={`Remove ${FILTER_LABELS[key].toLowerCase()}`}
            >
              {filterChipText(key, filters[key])} <X className="h-3.5 w-3.5" />
            </button>
          ))}
          <button type="button" onClick={() => { setPage(0); setSearch(""); setFilters({ ...EMPTY_FILTERS }); }} className="ml-auto text-xs font-semibold text-[#0A4FE8] hover:underline">Clear all</button>
        </div>}

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

        {/* The issues we sell against. Holding two down narrows to companies
            that have both, which is how a person reads two pressed buttons. */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Issues to fix</p>
          <div className="flex flex-wrap items-center gap-2">
            {PROSPECT_ISSUES.map((issue) => {
              const active = activeIssues.includes(issue.key);
              return (
                <button
                  key={issue.key}
                  type="button"
                  onClick={() => toggleIssue(issue.key)}
                  aria-pressed={active}
                  title={issue.blurb}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${active ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-slate-200 text-slate-700 hover:border-[#0A4FE8]"}`}
                >
                  <AlertTriangle className="h-4 w-4" /> {issue.label}
                </button>
              );
            })}
            {activeIssues.length > 0 && (
              <button type="button" onClick={() => setFilter("issues", "")} className="text-xs font-bold text-[#0A4FE8] hover:underline">
                Clear issues
              </button>
            )}
          </div>
        </div>

        {/* The deal score, as a band. The tooltip carries what the number is
            made of so the reader never has to take it on trust. */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold text-slate-500">Deal score</p>
          <div className="flex flex-wrap items-center gap-2">
            {([["below", `Below ${SCORE_SPLIT}`, "", String(SCORE_SPLIT - 1)], ["above", `${SCORE_SPLIT} and above`, String(SCORE_SPLIT), ""]] as Array<[string, string, string, string]>).map(([key, label, from, to]) => (
              <button
                key={key}
                type="button"
                onClick={() => (scoreBand === key ? setScoreBand("", "") : setScoreBand(from, to))}
                aria-pressed={scoreBand === key}
                title={`Deal score out of 100.\n${SCORE_METRIC.join("\n")}`}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${scoreBand === key ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-slate-200 text-slate-700 hover:border-[#0A4FE8]"}`}
              >
                <Target className="h-4 w-4" /> {label}
              </button>
            ))}
            {/* Ordering, not filtering: these say which end of the range to
                read from, and sit here because that is where the score is. */}
            {([["score_asc", "Lowest first, 0 to 100", ArrowUpNarrowWide], ["score", "Highest first, 100 to 0", ArrowDownWideNarrow]] as Array<[string, string, typeof Target]>).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                aria-pressed={sort === key}
                title={`Order the directory by deal score.\nDeal score out of 100.\n${SCORE_METRIC.join("\n")}`}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${sort === key ? "border-[#0A4FE8] bg-blue-50 text-[#0A4FE8]" : "border-slate-200 text-slate-700 hover:border-[#0A4FE8]"}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
            {scoreBand === "exact" && (
              <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#0A4FE8] bg-[#0A4FE8] px-3 text-sm font-semibold text-white">
                <Target className="h-4 w-4" /> Scored exactly {filters.score_from}
              </span>
            )}
            {(filters.score_from || filters.score_to) && (
              <button type="button" onClick={() => setScoreBand("", "")} className="text-xs font-bold text-[#0A4FE8] hover:underline">
                Clear score
              </button>
            )}
            <span className="text-xs text-slate-400" title={SCORE_METRIC.join("\n")}>Out of 100: website condition 35, trading status 25, decision makers 20, a way to reach them 10, social presence 10</span>
          </div>
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
          <Labelled label="Deal score between"><div className="flex gap-2"><input type="number" min={0} max={100} value={filters.score_from} onChange={(event) => setFilter("score_from", event.target.value)} placeholder="Min" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8]" /><input type="number" min={0} max={100} value={filters.score_to} onChange={(event) => setFilter("score_to", event.target.value)} placeholder="Max" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8]" /></div></Labelled>
          <div className="flex items-end"><button onClick={() => { setPage(0); setSearch(""); setFilters({ ...EMPTY_FILTERS }); }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-[#0A4FE8]">Clear filters</button></div>
        </div>}

        {loading || (listLoading && companies.length === 0) ? <p className="inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {filters.q ? `Searching for ${filters.q}` : "Loading companies"}</p>
          : companies.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">{filters.q ? `No company matches "${filters.q}" in this view. Try clearing the filters or a shorter word.` : `No companies match this view yet. Add a list above to start building toward ${DIRECTORY_TARGET.toLocaleString()}.`}</p>
            : <ul aria-busy={listLoading} className={`space-y-3 transition-opacity duration-150 ${listLoading ? "opacity-50" : "opacity-100"}`}>
              {companies.map((company) => (
                <li id={`prospect-company-${company.id}`} key={company.id} className="scroll-mt-6 rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-[#07133B]">{company.company_name}</h3>
                        <button type="button" onClick={() => setScoreBand(String(company.deal_score), String(company.deal_score))} title={`Show every company scoring ${company.deal_score}.\nDeal score out of 100.\n${SCORE_METRIC.join("\n")}`} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold hover:opacity-80 ${PRIORITY_TONE[company.priority] || PRIORITY_TONE.low}`}>{company.deal_score} score</button>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ACTIVITY_TONE[company.activity_status]}`}>{company.activity_status}</span>
                        {/* The issue chips below already say "Outdated
                            website" in as many words, so the status chip is
                            left out rather than printing the same fact twice. */}
                        {!(company.website_status === "outdated" && (company.issues || []).includes("outdated_website")) && (
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${WEBSITE_TONE[company.website_status]}`}>{company.website_status} website</span>
                        )}
                        {company.country_count > 1 && <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#0A4FE8]"><MapPin className="h-3 w-3" /> Available in {company.country_count} countries</span>}
                        {company.is_public && <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600"><Landmark className="h-3 w-3" /> {company.stock_exchanges?.length ? `${company.stock_exchanges.join(", ")}${company.ticker ? `: ${company.ticker}` : ""}` : "Publicly traded"}</span>}
                        {company.is_startup && <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Startup</span>}
                        {company.review_status === "promoted" && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">On checklist</span>}
                        {(company.issues || []).map((issue) => (
                          <span key={issue} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                            <AlertTriangle className="h-3 w-3" /> {issueLabel(issue)}
                          </span>
                        ))}
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
                    {/* Below xl the labels drop away and every action becomes its
                        icon, so a row of five buttons still fits a phone. */}
                    <div className="flex flex-wrap gap-2">
                      {company.enrichment_status === "enriched" && !company.prospect_id && (
                        <RowAction
                          label="Add to checklist"
                          icon={Users}
                          primary
                          busy={busy === company.id}
                          onClick={() => act(company.id, { action: "promote", id: company.id }, `${company.company_name} was added to the prospect checklist.`)}
                        />
                      )}
                      <RowAction
                        label="Audit"
                        title={`Run a full brand audit on ${company.company_name}`}
                        icon={ClipboardCheck}
                        busy={busy === `audit:${company.id}`}
                        disabled={!company.website}
                        onClick={() => runAudit(company)}
                      />
                      <RowAction
                        label="Proposal"
                        title={`Draft a proposal for ${company.company_name}`}
                        icon={FileText}
                        busy={busy === `proposal:${company.id}`}
                        disabled={!company.website}
                        onClick={() => draftProposal(company)}
                      />
                      <RowAction
                        label={company.review_status === "shortlisted" ? "Shortlisted" : "Shortlist"}
                        title={company.prospect_id
                          ? `${company.company_name} is on the prospect checklist`
                          : "Shortlist this company and add it to the prospect checklist"}
                        icon={Bookmark}
                        active={company.review_status === "shortlisted"}
                        onClick={() => void toggleShortlist(company)}
                      />
                      <RowAction
                        label="Details"
                        icon={expanded === company.id ? ChevronUp : ChevronDown}
                        onClick={() => {
                          const opening = expanded !== company.id;
                          setExpanded(opening ? company.id : "");
                          if (opening) void ensureDetail(company).catch((error) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load this company." }));
                        }}
                      />
                      <RowAction label="Remove" icon={Trash2} tone="danger" iconOnly onClick={() => removeCompany(company)} />
                    </div>
                  </div>

                  {/* The research arrives per company, so the panel binds to the
                      full record and every field below reads from that. */}
                  {expanded === company.id && ((company?: Company) => !company ? (
                    <p className="mt-4 inline-flex items-center gap-2 border-t border-slate-100 pt-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading research</p>
                  ) : (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <ProspectResearchPanel
                        company={company}
                        competitorActions={<div>
                      <button
                        type="button"
                        onClick={() => refreshCompetitors(company)}
                        disabled={busy === `competitors:${company.id}` || running}
                        className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-[#0A4FE8] px-3 text-xs font-semibold text-[#0A4FE8] hover:bg-[#0A4FE8]/5 disabled:opacity-50"
                      >
                        {busy === `competitors:${company.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        {busy === `competitors:${company.id}` ? "Checking competitors..." : "Re-check competitors"}
                      </button>
                      <p className="mt-1 text-xs text-slate-400">Re-runs the public research for this company and replaces the competitor lists with verified company-level results.</p>
                    </div>}
                        outreachActions={<div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => composeEmail(company)} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-[#0A4FE8] px-3 text-xs font-semibold text-white"><Send className="h-3.5 w-3.5" /> Compose email</button>
                        <button onClick={() => copyRecipients(company)} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-[#0A4FE8]"><Mail className="h-3.5 w-3.5" /> Copy recipients</button>
                        <span className="text-xs text-slate-500">{recipientsFor(company).length} address{recipientsFor(company).length === 1 ? "" : "es"} found: {recipientsFor(company).join(", ") || "none, search for one in the composer"}</span>
                      </div>}
                      />
                    </div>
                  ))(details[company.id])}
                </li>
              ))}
            </ul>}

        {total > pageSize && <div className="mt-5 flex items-center justify-between gap-3 text-sm">
          <button onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} className="min-h-10 rounded-xl border border-slate-200 px-4 font-semibold text-slate-700 disabled:opacity-50">Previous</button>
          <span className="text-slate-500">Page {(page + 1).toLocaleString()} of {Math.ceil(total / pageSize).toLocaleString()}{estimated ? " (estimated)" : ""}</span>
          <button onClick={() => setPage((current) => current + 1)} disabled={(page + 1) * pageSize >= total} className="min-h-10 rounded-xl border border-slate-200 px-4 font-semibold text-slate-700 disabled:opacity-50">Next</button>
        </div>}
      </section>

      {composeCompany && <FirstEmailComposer
        company={composeCompany}
        onClose={() => setComposeCompany(null)}
        onSent={setNotice}
        onChanged={() => void refresh()}
      />}
      {proposalCompany && proposalSource && (
        <ProposalPreviewModal
          source={proposalSource}
          label={proposalCompany.company_name}
          onClose={() => setProposalCompany(null)}
          onGenerated={(proposalId) => router.push(`/admin/deals/proposals?proposal=${encodeURIComponent(proposalId)}`)}
        />
      )}
    </main>
  );
}

function Stat({ label, value, icon: Icon, onClick }: {
  label: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  const body = <>
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Icon className="h-4 w-4 text-[#0A4FE8]" /> {label}</div>
    <p className="mt-1.5 text-2xl font-bold text-[#07133B]">{(value || 0).toLocaleString()}</p>
  </>;
  if (!onClick) return <div className="rounded-2xl border border-slate-200 p-4">{body}</div>;
  return <button
    type="button"
    onClick={onClick}
    title={`Show ${label.toLowerCase()} in the directory`}
    className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-[#0A4FE8] hover:bg-blue-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0A4FE8]"
  >
    {body}
  </button>;
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

/**
 * One action on a company row. Full label from xl up, icon alone below that,
 * where a row of five buttons would otherwise wrap into a wall. The label never
 * disappears entirely: it stays as the accessible name and the tooltip.
 */
function RowAction({ label, icon: Icon, onClick, busy, disabled, primary, active, tone, iconOnly, title }: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  primary?: boolean;
  active?: boolean;
  tone?: "danger";
  iconOnly?: boolean;
  title?: string;
}) {
  const base = primary
    ? "bg-[#0A4FE8] text-white hover:bg-[#0846cf]"
    : tone === "danger"
      ? "border border-slate-200 text-rose-600 hover:border-rose-300"
      : active
        ? "border border-[#0A4FE8] bg-blue-50 text-[#0A4FE8]"
        : "border border-slate-200 text-slate-700 hover:border-[#0A4FE8]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      aria-label={label}
      title={title || label}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold disabled:opacity-50 ${base}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {!iconOnly && <span className="hidden xl:inline">{label}</span>}
    </button>
  );
}
