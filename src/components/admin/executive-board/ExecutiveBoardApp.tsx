"use client";

/**
 * Executive Board workspace.
 *
 * One client component drives all six views (overview, budgets, expansion
 * budgets, targets, revenue models, vault) because they share one board payload and the
 * same save/reload cycle. Each route renders it with a fixed `view`.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2, CalendarClock, CalendarRange, Check, ChevronDown, ChevronRight, Copy, Download, ExternalLink,
  FileText, Folder, FolderPlus, Landmark, Link2, Loader2, Lock, Paperclip, Pencil,
  Plus, Rocket, ScrollText, Search, ShieldCheck, Target as TargetIcon, Trash2, Unlock,
  Upload, Wallet, X,
} from "lucide-react";
import {
  BUDGET_CATEGORIES, BUDGET_MONTH_NAMES, BUDGET_MONTHS, BUDGET_STATUSES, KIND_LABELS, MODEL_STATUSES, STATUS_LABELS,
  STEP_STATUSES, TARGET_STATUSES, VAULT_KINDS, EXPANSION_BUDGET_PRIORITIES,
  EXPANSION_BUDGET_STATUSES, EXPANSION_BUDGET_TYPES, EXPANSION_TYPE_LABELS,
  BOARD_VIEW_CURRENCIES, budgetsInPeriod, budgetVariance, budgetYearRollup, convertMoney, currentBudgetPeriod, currencyUnit, expansionFundingGap,
  expansionRequirement, formatBytes, formatMoney, formatMoneyView, planProgress, summariseTargets,
  type BoardViewCurrency,
  shareIsLive, targetProgress,
  type Budget, type BudgetPeriod, type ExpansionBudget, type ExpansionBudgetDraft, type RevenueModel, type RevenueStep, type Target,
  type VaultFile, type VaultFolder, type VaultShare,
} from "@/lib/executive-board";
import { UnsavedDraftNotice, useUnsavedDraft } from "./useUnsavedDraft";
import { budgetPdf, budgetsPdf, expansionBudgetPdf, expansionBudgetsPdf, exportBoardToPdf, modelsPdf, overviewPdf, targetsPdf, vaultPdf } from "@/lib/executive-board-pdf";
import { appConfirm } from "@/lib/app-notify";

export type BoardView = "overview" | "budgets" | "expansion-budgets" | "targets" | "models" | "vault";

interface Board {
  budgets: Budget[];
  expansionBudgets: ExpansionBudget[];
  expansionDraft: ExpansionBudgetDraft | null;
  targets: Target[];
  models: RevenueModel[];
  folders: VaultFolder[];
  files: VaultFile[];
  shares: VaultShare[];
}

const EMPTY: Board = { budgets: [], expansionBudgets: [], expansionDraft: null, targets: [], models: [], folders: [], files: [], shares: [] };

const TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  active: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-500",
  on_track: "bg-emerald-50 text-emerald-700",
  at_risk: "bg-amber-50 text-amber-700",
  off_track: "bg-rose-50 text-rose-700",
  achieved: "bg-blue-50 text-[#0A4FE8]",
  exploring: "bg-slate-100 text-slate-600",
  piloting: "bg-amber-50 text-amber-700",
  paused: "bg-slate-100 text-slate-500",
  retired: "bg-slate-100 text-slate-400",
  todo: "bg-slate-100 text-slate-600",
  doing: "bg-amber-50 text-amber-700",
  blocked: "bg-rose-50 text-rose-700",
  done: "bg-emerald-50 text-emerald-700",
  idea: "bg-slate-100 text-slate-600",
  researching: "bg-violet-50 text-violet-700",
  planned: "bg-blue-50 text-[#0A4FE8]",
  approved: "bg-emerald-50 text-emerald-700",
  on_hold: "bg-amber-50 text-amber-700",
  launched: "bg-cyan-50 text-cyan-700",
  cancelled: "bg-rose-50 text-rose-700",
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700",
  critical: "bg-rose-50 text-rose-700",
};

const VIEW_META: Record<BoardView, { title: string; blurb: string }> = {
  overview: { title: "Executive Board", blurb: "Budgets, future expansion plans, targets, revenue models, and the documents behind them." },
  budgets: { title: "Budgets", blurb: "What we planned to spend, and what we actually spent." },
  "expansion-budgets": { title: "Expansion budgets", blurb: "Future company investments, funding needs, and target launch dates." },
  targets: { title: "Targets", blurb: "The numbers we are holding ourselves to, and where each one stands." },
  models: { title: "Revenue models", blurb: "How we make money, and the step-by-step plan to make each one work." },
  vault: { title: "Document vault", blurb: "Legal documents, attachments, and files. Lock any of them, then share by link." },
};

const label = (value: string) => STATUS_LABELS[value] || value;

/* ------------------------------------------------------------------ */

/**
 * The currency the board is currently being planned in. Every figure on the
 * page is restated in it, whatever currency the line was entered in, so plans
 * can be read end to end without doing arithmetic in your head.
 */
const CURRENCY_KEY = "cds.exec.currency";
const BoardCurrency = createContext<BoardViewCurrency>("USD");
const useBoardCurrency = () => useContext(BoardCurrency);

function CurrencyToggle({ value, onChange }: { value: BoardViewCurrency; onChange: (next: BoardViewCurrency) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Planning currency">
      {BOARD_VIEW_CURRENCIES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          aria-pressed={value === code}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${value === code ? "bg-[#0A4FE8] text-white" : "text-slate-500 hover:bg-slate-50"}`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

export default function ExecutiveBoardApp({ view }: { view: BoardView }) {
  const [board, setBoard] = useState<Board>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [currency, setCurrency] = useState<BoardViewCurrency>("USD");
  // Held here so the PDF export covers the month or year on screen.
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriod>(() => currentBudgetPeriod());

  // Remembered per browser so the board opens in the currency you plan in.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CURRENCY_KEY);
      if (saved && (BOARD_VIEW_CURRENCIES as readonly string[]).includes(saved)) {
        setCurrency(saved as BoardViewCurrency);
      }
    } catch { /* private mode: stay on the default */ }
  }, []);

  const pickCurrency = useCallback((next: BoardViewCurrency) => {
    setCurrency(next);
    try { window.localStorage.setItem(CURRENCY_KEY, next); } catch { /* noop */ }
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/executive-board?view=${encodeURIComponent(view)}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "Could not load the Executive Board.");
      setBoard({
        budgets: json.budgets || [], expansionBudgets: json.expansionBudgets || [], expansionDraft: json.expansionDraft || null,
        targets: json.targets || [], models: json.models || [],
        folders: json.folders || [], files: json.files || [], shares: json.shares || [],
      });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load the Executive Board." });
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => { void load(); }, [load]);

  const post = useCallback(async (url: string, payload: Record<string, unknown>, tag: string) => {
    setBusy(tag); setNotice(null);
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "Request failed.");
      return json;
    } finally {
      setBusy("");
    }
  }, []);

  const run = useCallback(async (
    url: string, payload: Record<string, unknown>, tag: string, success: string,
  ) => {
    try {
      const json = await post(url, payload, tag);
      await load();
      setNotice({ tone: "success", text: success });
      return json;
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Request failed." });
      return null;
    }
  }, [post, load]);

  const meta = VIEW_META[view];

  const [exporting, setExporting] = useState(false);

  /**
   * Exports whichever view is on screen, in the currency it is being read in,
   * as the same branded document family as an invoice. jsPDF is only pulled in
   * on the click so the board itself stays light.
   */
  const exportPdf = useCallback(async () => {
    setExporting(true);
    try {
      const payload =
        view === "budgets" ? budgetsPdf(board.budgets, currency, budgetPeriod)
          : view === "expansion-budgets" ? expansionBudgetsPdf(board.expansionBudgets, currency)
          : view === "targets" ? targetsPdf(board.targets, currency)
            : view === "models" ? modelsPdf(board.models, currency)
              : view === "vault" ? vaultPdf(board.files, board.folders, currency)
                : overviewPdf(board, currency);
      await exportBoardToPdf(payload);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "The PDF could not be built." });
    } finally {
      setExporting(false);
    }
  }, [view, board, currency, budgetPeriod]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/executive-board" className="text-xs font-semibold text-[#0A4FE8] hover:underline">
            Executive Board
          </Link>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[#07133B] sm:text-[28px]">{meta.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{meta.blurb}</p>
        </div>
        <div className="flex items-center gap-3">
          {loading && <Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" />}
          <CurrencyToggle value={currency} onChange={pickCurrency} />
          <button
            type="button"
            onClick={exportPdf}
            disabled={exporting || loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-[#0A4FE8] hover:text-[#0A4FE8] disabled:opacity-50"
            title={`Download ${meta.title} as a branded PDF`}
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? "Building..." : "Export PDF"}
          </button>
        </div>
      </header>

      {notice && (
        <div className={`mb-5 flex items-start justify-between gap-3 rounded-2xl px-4 py-3 text-sm ${notice.tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      <BoardCurrency.Provider value={currency}>
        {view === "overview" && <Overview board={board} />}
        {view === "budgets" && <Budgets board={board} busy={busy} run={run} period={budgetPeriod} setPeriod={setBudgetPeriod} />}
        {view === "expansion-budgets" && <ExpansionBudgets board={board} busy={busy} run={run} />}
        {view === "targets" && <Targets board={board} busy={busy} run={run} />}
        {view === "models" && <Models board={board} busy={busy} run={run} />}
        {view === "vault" && <Vault board={board} busy={busy} run={run} reload={load} setNotice={setNotice} />}
      </BoardCurrency.Provider>
    </div>
  );
}

type Run = (url: string, payload: Record<string, unknown>, tag: string, success: string) => Promise<any>;

/* ---------------------------- Shared bits ---------------------------- */

function Badge({ value }: { value: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE[value] || "bg-slate-100 text-slate-600"}`}>{label(value)}</span>;
}

/**
 * A money figure shown in the board's planning currency, with the amount as it
 * was actually entered underneath. The headline number is a conversion at our
 * hand-maintained rate, so the entered figure stays visible as the record.
 */
function Money({ amount, currency, className = "", tone = "" }: { amount: number; currency: string; className?: string; tone?: string }) {
  const view = useBoardCurrency();
  const { primary, note } = formatMoneyView(amount, currency, view);
  return (
    <span className={className}>
      <span className={tone}>{primary}</span>
      {note && <span className="block text-xs font-medium text-slate-400">{note}</span>}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 ${className}`}>{children}</div>;
}

function Stat({ icon: Icon, label: text, value, hint }: { icon: typeof Wallet; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
        <Icon className="h-3.5 w-3.5" /> {text}
      </div>
      <p className="mt-2 text-2xl font-black tracking-tight text-[#07133B]">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-600">{text}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass = "h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]";
const areaClass = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0A4FE8]";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-h-[90vh] sm:w-[min(40rem,100%)] sm:rounded-3xl sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[#07133B]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center text-sm text-slate-400">{text}</p>;
}

/* ------------------------------ Overview ------------------------------ */

function Overview({ board }: { board: Board }) {
  const view = useBoardCurrency();
  // Budget lines can each be entered in a different currency, so every one is
  // converted into the view currency before it is added up. A line with no
  // published rate is counted at face value rather than dropped.
  const into = (amount: number, from: string) => convertMoney(amount, from, view) ?? Number(amount || 0);
  const planned = board.budgets.reduce((sum, b) => sum + into(Number(b.planned_amount || 0), b.currency), 0);
  const actual = board.budgets.reduce((sum, b) => sum + into(Number(b.actual_amount || 0), b.currency), 0);
  const futureExpansions = board.expansionBudgets.filter((item) => item.status !== "launched" && item.status !== "cancelled");
  const expansionForecast = futureExpansions.reduce(
    (sum, item) => sum + into(expansionRequirement(item), item.currency),
    0,
  );
  const currency = view;
  const activeModels = board.models.filter((m) => m.status === "active").length;
  const atRisk = board.targets.filter((t) => t.status === "at_risk" || t.status === "off_track").length;
  const locked = board.files.filter((f) => f.has_password || f.inherits_password).length;
  const liveShares = board.shares.filter(shareIsLive).length;

  const links: Array<{ href: string; icon: typeof Wallet; title: string; body: string }> = [
    { href: "/admin/executive-board/budgets", icon: Wallet, title: "Budgets", body: `${board.budgets.length} line${board.budgets.length === 1 ? "" : "s"} tracked` },
    { href: "/admin/executive-board/expansion-budgets", icon: Building2, title: "Expansion budgets", body: `${futureExpansions.length} future plan${futureExpansions.length === 1 ? "" : "s"} · ${formatMoneyView(expansionForecast, view, view).primary}` },
    { href: "/admin/executive-board/targets", icon: TargetIcon, title: "Targets", body: `${board.targets.length} target${board.targets.length === 1 ? "" : "s"}, ${atRisk} needing attention` },
    { href: "/admin/executive-board/revenue-models", icon: Rocket, title: "Revenue models", body: `${board.models.length} model${board.models.length === 1 ? "" : "s"}, ${activeModels} active` },
    { href: "/admin/executive-board/vault", icon: Lock, title: "Document vault", body: `${board.files.length} file${board.files.length === 1 ? "" : "s"}, ${locked} protected` },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          icon={Wallet}
          label="Planned spend"
          value={formatMoneyView(planned, currency, view).primary}
          hint={`${board.budgets.length} budget lines`}
        />
        <Stat
          icon={Landmark}
          label="Actual spend"
          value={formatMoneyView(actual, currency, view).primary}
          hint={`${formatMoneyView(planned - actual, currency, view).primary} variance`}
        />
        <Stat
          icon={Building2}
          label="Expansion forecast"
          value={formatMoneyView(expansionForecast, currency, view).primary}
          hint={`${futureExpansions.length} future plan${futureExpansions.length === 1 ? "" : "s"}`}
        />
        <Stat icon={TargetIcon} label="Targets at risk" value={String(atRisk)} hint={`of ${board.targets.length} tracked`} />
        <Stat icon={Link2} label="Live share links" value={String(liveShares)} hint={`${locked} protected files`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-[#0A4FE8]">
            <div className="flex items-center justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><link.icon className="h-5 w-5" /></span>
              <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#0A4FE8]" />
            </div>
            <p className="mt-3 text-sm font-bold text-[#07133B]">{link.title}</p>
            <p className="text-xs text-slate-500">{link.body}</p>
          </Link>
        ))}
      </div>

      {board.models.length > 0 && (
        <Card>
          <h2 className="text-sm font-bold text-[#07133B]">Execution progress</h2>
          <div className="mt-3 space-y-3">
            {board.models.map((model) => (
              <div key={model.id}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-semibold text-[#07133B]">{model.name}</span>
                  <span className="shrink-0 text-xs text-slate-400">{planProgress(model.steps)}% of {model.steps.length} steps</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#0A4FE8]" style={{ width: `${planProgress(model.steps)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------- Budgets ------------------------------- */

const emptyBudget = (period?: { year: number; month: number }): Partial<Budget> => {
  const today = currentBudgetPeriod();
  return {
    title: "", category: "operations", period_label: "", currency: "USD",
    planned_amount: 0, actual_amount: 0, status: "draft", owner: "", notes: "",
    budget_year: period?.year ?? today.year, budget_month: period?.month ?? today.month,
  };
};

const periodName = (period: BudgetPeriod) =>
  period.month === "annual" ? `${period.year}` : `${BUDGET_MONTH_NAMES[period.month - 1]} ${period.year}`;

function BudgetPeriodBar({ budgets, period, setPeriod }: { budgets: Budget[]; period: BudgetPeriod; setPeriod: (next: BudgetPeriod) => void }) {
  const today = currentBudgetPeriod();
  const years = useMemo(() => {
    const set = new Set<number>([today.year - 1, today.year, today.year + 1, period.year]);
    for (const budget of budgets) set.add(Number(budget.budget_year));
    return Array.from(set).filter(Number.isFinite).sort((a, b) => b - a);
  }, [budgets, period.year, today.year]);
  const counts = useMemo(() => {
    const byMonth = new Array(12).fill(0);
    for (const budget of budgetsInPeriod(budgets, { year: period.year, month: "annual" })) byMonth[Number(budget.budget_month) - 1] += 1;
    return byMonth;
  }, [budgets, period.year]);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-500">
          Year
          <select
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#07133B] outline-none focus:border-[#0A4FE8]"
            value={period.year}
            onChange={(event) => setPeriod({ ...period, year: Number(event.target.value) })}
            aria-label="Budget year"
          >
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setPeriod({ year: period.year, month: period.month === "annual" ? (period.year === today.year ? today.month : 1) : "annual" })}
          aria-pressed={period.month === "annual"}
          className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${period.month === "annual" ? "bg-[#0A4FE8] text-white" : "border border-slate-200 text-slate-700 hover:border-[#0A4FE8] hover:text-[#0A4FE8]"}`}
        >
          <CalendarRange className="h-4 w-4" /> Annual operations budget
        </button>
      </div>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label={`Budget months for ${period.year}`}>
        {BUDGET_MONTHS.map((name, index) => {
          const month = index + 1;
          const active = period.month === month;
          const isToday = period.year === today.year && month === today.month;
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPeriod({ year: period.year, month })}
              title={`${BUDGET_MONTH_NAMES[index]} ${period.year}${counts[index] ? ` · ${counts[index]} line${counts[index] === 1 ? "" : "s"}` : ""}`}
              className={`flex min-w-[3.75rem] flex-1 flex-col items-center rounded-xl px-2 py-2 text-sm transition ${active ? "bg-[#0A4FE8] font-semibold text-white" : `text-slate-600 hover:bg-slate-50 ${isToday ? "ring-1 ring-inset ring-[#0A4FE8]/30" : ""}`}`}
            >
              {name}
              <span className={`mt-0.5 text-[11px] ${active ? "text-white/80" : counts[index] ? "text-slate-500" : "text-slate-300"}`}>{counts[index] || "-"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BudgetTotals({ planned, actual, currency }: { planned: number; actual: number; currency: string }) {
  return (
    <div className="flex flex-wrap gap-3 text-sm text-slate-500">
      <span>Planned <Money amount={planned} currency={currency} className="inline-block align-top" tone="font-bold text-[#07133B]" /></span>
      <span>Actual <Money amount={actual} currency={currency} className="inline-block align-top" tone="font-bold text-[#07133B]" /></span>
      <span>Variance <Money amount={planned - actual} currency={currency} className="inline-block align-top" tone={planned - actual < 0 ? "font-bold text-rose-600" : "font-bold text-emerald-700"} /></span>
    </div>
  );
}

function AnnualBudget({ budgets, year, setPeriod }: { budgets: Budget[]; year: number; setPeriod: (next: BudgetPeriod) => void }) {
  const view = useBoardCurrency();
  const rollup = useMemo(() => budgetYearRollup(budgets, year, view), [budgets, year, view]);
  const head = "bg-slate-50 text-left text-[11px] font-semibold text-slate-500";

  if (!rollup.lines.length) return <Empty text={`No budget lines for ${year} yet. Pick a month to start planning.`} />;

  return (
    <div className="space-y-4">
      <BudgetTotals planned={rollup.planned} actual={rollup.actual} currency={view} />
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className={head}>
            <tr>
              <th className="px-4 py-3">Month</th><th className="px-4 py-3 text-right">Lines</th>
              <th className="px-4 py-3 text-right">Planned</th><th className="px-4 py-3 text-right">Actual</th>
              <th className="px-4 py-3 text-right">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rollup.months.map((month) => (
              <tr key={month.month} className="cursor-pointer hover:bg-slate-50" onClick={() => setPeriod({ year, month: month.month })}>
                <td className="px-4 py-3 font-semibold text-[#07133B]">{month.name}</td>
                <td className="px-4 py-3 text-right text-slate-500">{month.lines || "-"}</td>
                <td className="px-4 py-3 text-right text-slate-600"><Money amount={month.planned} currency={view} /></td>
                <td className="px-4 py-3 text-right text-slate-600"><Money amount={month.actual} currency={view} /></td>
                <td className="px-4 py-3 text-right"><Money amount={month.planned - month.actual} currency={view} tone={`font-semibold ${month.planned - month.actual < 0 ? "text-rose-600" : "text-emerald-700"}`} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-[#07133B]">
            <tr>
              <td className="px-4 py-3">Total for {year}</td>
              <td className="px-4 py-3 text-right">{rollup.lines.length}</td>
              <td className="px-4 py-3 text-right"><Money amount={rollup.planned} currency={view} /></td>
              <td className="px-4 py-3 text-right"><Money amount={rollup.actual} currency={view} /></td>
              <td className="px-4 py-3 text-right"><Money amount={rollup.planned - rollup.actual} currency={view} tone={rollup.planned - rollup.actual < 0 ? "text-rose-600" : "text-emerald-700"} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className={head}>
            <tr>
              <th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Lines</th>
              <th className="px-4 py-3 text-right">Planned</th><th className="px-4 py-3 text-right">Actual</th>
              <th className="px-4 py-3 text-right">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rollup.categories.map((category) => (
              <tr key={category.category}>
                <td className="px-4 py-3 font-semibold capitalize text-[#07133B]">{category.category}</td>
                <td className="px-4 py-3 text-right text-slate-500">{category.lines}</td>
                <td className="px-4 py-3 text-right text-slate-600"><Money amount={category.planned} currency={view} /></td>
                <td className="px-4 py-3 text-right text-slate-600"><Money amount={category.actual} currency={view} /></td>
                <td className="px-4 py-3 text-right"><Money amount={category.planned - category.actual} currency={view} tone={`font-semibold ${category.planned - category.actual < 0 ? "text-rose-600" : "text-emerald-700"}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Budgets({ board, busy, run, period, setPeriod }: { board: Board; busy: string; run: Run; period: BudgetPeriod; setPeriod: (next: BudgetPeriod) => void }) {
  const [draft, setDraft] = useState<Partial<Budget> | null>(null);
  const monthPeriod = period.month === "annual" ? null : { year: period.year, month: period.month };
  // A blank form on every "new", with the last unsaved attempt offered beside it.
  const recovery = useUnsavedDraft<Partial<Budget>>({
    key: "budget",
    draft,
    isNew: Boolean(draft) && !draft?.id,
    blank: emptyBudget(monthPeriod ?? undefined),
    onResume: setDraft,
  });

  const save = async () => {
    if (!draft) return;
    const done = await run("/api/admin/executive-board", { action: "save_budget", ...draft }, "budget", "Budget saved.");
    if (done) {
      recovery.clear();
      setDraft(null);
      // Follow the line to the month it was saved in.
      if (draft.budget_year && draft.budget_month) setPeriod({ year: Number(draft.budget_year), month: Number(draft.budget_month) });
    }
  };

  const view = useBoardCurrency();
  const lines = useMemo(() => budgetsInPeriod(board.budgets, period), [board.budgets, period]);
  const totals = useMemo(() => {
    const into = (amount: number, from: string) => convertMoney(amount, from, view) ?? Number(amount || 0);
    return {
      currency: view,
      planned: lines.reduce((sum, b) => sum + into(Number(b.planned_amount || 0), b.currency), 0),
      actual: lines.reduce((sum, b) => sum + into(Number(b.actual_amount || 0), b.currency), 0),
    };
  }, [lines, view]);

  return (
    <div className="space-y-4">
      <BudgetPeriodBar budgets={board.budgets} period={period} setPeriod={setPeriod} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[#07133B]">
          {period.month === "annual" ? `Annual operations budget ${period.year}` : `Budget for ${periodName(period)}`}
        </h2>
        {monthPeriod && (
          <button type="button" onClick={() => setDraft(emptyBudget(monthPeriod))} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-sm font-bold text-white">
            <Plus className="h-4 w-4" /> New budget line
          </button>
        )}
      </div>

      {period.month === "annual" ? <AnnualBudget budgets={board.budgets} year={period.year} setPeriod={setPeriod} /> : (
        <>
          <BudgetTotals planned={totals.planned} actual={totals.actual} currency={totals.currency} />
          {lines.length === 0 ? <Empty text={`No budget lines for ${periodName(period)} yet.`} /> : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Line</th><th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3 text-right">Planned</th><th className="px-4 py-3 text-right">Actual</th>
                    <th className="px-4 py-3 text-right">Variance</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((budget) => {
                    const variance = budgetVariance(budget);
                    return (
                      <tr key={budget.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#07133B]">{budget.title}</p>
                          <p className="text-xs text-slate-400">{budget.category}{budget.owner ? ` · ${budget.owner}` : ""}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{budget.period_label || (budget.period_start ? `${budget.period_start} to ${budget.period_end || "open"}` : "-")}</td>
                        <td className="px-4 py-3 text-right text-slate-600"><Money amount={budget.planned_amount} currency={budget.currency} /></td>
                        <td className="px-4 py-3 text-right text-slate-600"><Money amount={budget.actual_amount} currency={budget.currency} /></td>
                        <td className="px-4 py-3 text-right"><Money amount={variance} currency={budget.currency} tone={`font-semibold ${variance < 0 ? "text-rose-600" : "text-emerald-700"}`} /></td>
                        <td className="px-4 py-3"><Badge value={budget.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button type="button" onClick={() => void exportBoardToPdf(budgetPdf(budget, view))} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-[#0A4FE8]" aria-label={`Download ${budget.title} with its implementation plan`} title="Download this budget and its implementation plan"><Download className="h-4 w-4" /></button>
                            <button type="button" onClick={() => setDraft(budget)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                            <button type="button" onClick={() => run("/api/admin/executive-board", { action: "delete_budget", id: budget.id }, "budget", "Budget removed.")} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {draft && (
        <Modal title={draft.id ? "Edit budget line" : "New budget line"} onClose={() => setDraft(null)}>
          <UnsavedDraftNotice<Partial<Budget>>
            recovery={recovery}
            label="budget line"
            describe={(item) => item.title || ""}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Title"><input className={inputClass} value={draft.title || ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Q1 marketing" /></Field></div>
            <Field label="Category">
              <select className={inputClass} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {BUDGET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className={inputClass} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Budget["status"] })}>
                {BUDGET_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </Field>
            <Field label="Month">
              <select className={inputClass} value={draft.budget_month ?? 1} onChange={(e) => setDraft({ ...draft, budget_month: Number(e.target.value) })}>
                {BUDGET_MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
              </select>
            </Field>
            <Field label="Year"><input type="number" min={2000} max={2100} className={inputClass} value={String(draft.budget_year ?? "")} onChange={(e) => setDraft({ ...draft, budget_year: Number(e.target.value) })} /></Field>
            <Field label="Period label"><input className={inputClass} value={draft.period_label || ""} onChange={(e) => setDraft({ ...draft, period_label: e.target.value })} placeholder="Optional, e.g. Q3 2026" /></Field>
            <Field label="Owner"><input className={inputClass} value={draft.owner || ""} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} placeholder="Who owns this" /></Field>
            <Field label="Starts"><input type="date" className={inputClass} value={draft.period_start || ""} onChange={(e) => setDraft({ ...draft, period_start: e.target.value })} /></Field>
            <Field label="Ends"><input type="date" className={inputClass} value={draft.period_end || ""} onChange={(e) => setDraft({ ...draft, period_end: e.target.value })} /></Field>
            <Field label="Currency">
              <select className={inputClass} value={draft.currency || "USD"} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
                {BOARD_VIEW_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </Field>
            <Field label="Planned"><input type="number" step="0.01" className={inputClass} value={String(draft.planned_amount ?? 0)} onChange={(e) => setDraft({ ...draft, planned_amount: Number(e.target.value) })} /></Field>
            <Field label="Actual"><input type="number" step="0.01" className={inputClass} value={String(draft.actual_amount ?? 0)} onChange={(e) => setDraft({ ...draft, actual_amount: Number(e.target.value) })} /></Field>
            <div className="sm:col-span-2"><Field label="Notes"><textarea rows={3} className={areaClass} value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field></div>
          </div>
          <button type="button" onClick={save} disabled={busy === "budget" || !draft.title} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-bold text-white disabled:opacity-50">
            {busy === "budget" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save budget line
          </button>
        </Modal>
      )}
    </div>
  );
}

/* -------------------------- Expansion budgets -------------------------- */

const emptyExpansionBudget = (): Partial<ExpansionBudget> => ({
  title: "",
  expansion_type: "new_market",
  location: "",
  rationale: "",
  target_start: "",
  target_end: "",
  currency: "USD",
  estimated_amount: 0,
  contingency_amount: 0,
  committed_amount: 0,
  funding_source: "",
  owner: "",
  priority: "medium",
  status: "idea",
  expected_outcome: "",
  notes: "",
});

function boardDate(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!value) return "Not set";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { ...options, timeZone: "UTC" });
}

function ExpansionBudgets({ board, busy, run }: { board: Board; busy: string; run: Run }) {
  const view = useBoardCurrency();
  const [draft, setDraft] = useState<Partial<ExpansionBudget> | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [restoredDraft, setRestoredDraft] = useState(false);
  const serverDraftHandled = useRef(false);
  const ignoreLoadedDraft = useRef(false);
  const lastSavedSignature = useRef("");
  const latestServerDraft = useRef<Partial<ExpansionBudget> | null>(null);
  const pendingDraftSave = useRef<Promise<void> | null>(null);
  const submitting = useRef(false);

  const persistDraft = useCallback((payload: Partial<ExpansionBudget>, keepalive = false) => {
    const previous = pendingDraftSave.current?.catch(() => undefined) ?? Promise.resolve();
    const request = previous.then(async () => {
      const response = await fetch("/api/admin/executive-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_expansion_budget_draft", payload }),
        keepalive,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "Draft save failed.");
      latestServerDraft.current = payload;
      ignoreLoadedDraft.current = false;
      lastSavedSignature.current = JSON.stringify(payload);
    });
    pendingDraftSave.current = request;
    return request;
  }, []);

  useEffect(() => {
    if (serverDraftHandled.current || !board.expansionDraft?.payload || draft) return;
    serverDraftHandled.current = true;
    const restored = { ...emptyExpansionBudget(), ...board.expansionDraft.payload };
    latestServerDraft.current = restored;
    lastSavedSignature.current = JSON.stringify(restored);
    setDraft(restored);
    setRestoredDraft(true);
    setDraftState("saved");
  }, [board.expansionDraft, draft]);

  useEffect(() => {
    if (!draft) return;
    const signature = JSON.stringify(draft);
    if (signature === lastSavedSignature.current) return;
    setDraftState("saving");
    const timer = window.setTimeout(() => {
      if (submitting.current) return;
      void persistDraft(draft)
        .then(() => setDraftState("saved"))
        .catch(() => setDraftState("error"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draft, persistDraft]);

  useEffect(() => {
    const saveBeforeLeaving = () => {
      if (draft && JSON.stringify(draft) !== lastSavedSignature.current) void persistDraft(draft, true);
    };
    window.addEventListener("pagehide", saveBeforeLeaving);
    return () => window.removeEventListener("pagehide", saveBeforeLeaving);
  }, [draft, persistDraft]);

  const openDraft = (next: Partial<ExpansionBudget>, restored = false) => {
    lastSavedSignature.current = JSON.stringify(next);
    setRestoredDraft(restored);
    setDraftState(restored ? "saved" : "idle");
    setDraft(next);
  };

  const startNew = () => {
    const unfinished = latestServerDraft.current || (!ignoreLoadedDraft.current ? board.expansionDraft?.payload : null);
    openDraft(unfinished ? { ...emptyExpansionBudget(), ...unfinished } : emptyExpansionBudget(), Boolean(unfinished));
  };

  const edit = (budget: ExpansionBudget) => {
    const unfinished = latestServerDraft.current || (!ignoreLoadedDraft.current ? board.expansionDraft?.payload : null);
    const matches = unfinished?.id === budget.id;
    openDraft(matches ? { ...budget, ...unfinished } : budget, matches);
  };

  const close = () => {
    if (draft && JSON.stringify(draft) !== lastSavedSignature.current) void persistDraft(draft, true);
    setDraft(null);
    setRestoredDraft(false);
  };

  const discard = async () => {
    submitting.current = true;
    try {
      await pendingDraftSave.current?.catch(() => undefined);
      const response = await fetch("/api/admin/executive-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_expansion_budget_draft" }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "Draft could not be discarded.");
      latestServerDraft.current = null;
      ignoreLoadedDraft.current = true;
      lastSavedSignature.current = "";
      setDraft(null);
      setRestoredDraft(false);
      setDraftState("idle");
    } catch {
      setDraftState("error");
    } finally {
      submitting.current = false;
    }
  };

  const save = async () => {
    if (!draft) return;
    submitting.current = true;
    try {
      await pendingDraftSave.current?.catch(() => undefined);
      const done = await run(
        "/api/admin/executive-board",
        { action: "save_expansion_budget", ...draft },
        "expansion-budget",
        "Expansion budget saved.",
      );
      if (done) {
        latestServerDraft.current = null;
        ignoreLoadedDraft.current = true;
        lastSavedSignature.current = "";
        setDraft(null);
        setRestoredDraft(false);
        setDraftState("idle");
      } else {
        await persistDraft(draft).catch(() => undefined);
        setDraftState("error");
      }
    } finally {
      submitting.current = false;
    }
  };

  const remove = async (budget: ExpansionBudget) => {
    if (!(await appConfirm(`Delete the expansion budget “${budget.title}”?`))) return;
    await run(
      "/api/admin/executive-board",
      { action: "delete_expansion_budget", id: budget.id },
      "expansion-budget",
      "Expansion budget removed.",
    );
  };

  const activePlans = board.expansionBudgets.filter((item) => item.status !== "launched" && item.status !== "cancelled");
  const intoView = (amount: number, currency: string) => convertMoney(amount, currency, view) ?? Number(amount || 0);
  const forecast = activePlans.reduce((sum, item) => sum + intoView(expansionRequirement(item), item.currency), 0);
  const committed = activePlans.reduce((sum, item) => sum + intoView(Number(item.committed_amount || 0), item.currency), 0);
  const gap = activePlans.reduce((sum, item) => sum + intoView(expansionFundingGap(item), item.currency), 0);
  const today = new Date().toISOString().slice(0, 10);
  const nextPlan = activePlans.find((item) => item.target_start >= today) || activePlans[0];
  const visible = statusFilter === "all"
    ? board.expansionBudgets
    : board.expansionBudgets.filter((item) => item.status === statusFilter);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Building2} label="Future plans" value={String(activePlans.length)} hint={`${board.expansionBudgets.length} total records`} />
        <Stat icon={Wallet} label="Forecast requirement" value={formatMoneyView(forecast, view, view).primary} hint="Estimate plus contingency" />
        <Stat icon={Landmark} label="Committed funding" value={formatMoneyView(committed, view, view).primary} hint={`${formatMoneyView(gap, view, view).primary} funding gap`} />
        <Stat icon={CalendarClock} label="Next planned start" value={nextPlan ? boardDate(nextPlan.target_start, { month: "short", year: "numeric" }) : "Not scheduled"} hint={nextPlan?.title || "Add the first expansion plan"} />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0A4FE8] text-white"><Building2 className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-semibold text-[#07133B]">Plan investment before it reaches the operating budget</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">Use this pipeline for future markets, offices, hiring, products, technology, infrastructure, or acquisitions.</p>
          </div>
        </div>
        <button type="button" onClick={startNew} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" /> New expansion budget
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Showing {visible.length} of {board.expansionBudgets.length} expansion plans</p>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#0A4FE8]">
            <option value="all">All stages</option>
            {EXPANSION_BUDGET_STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </label>
      </div>

      {visible.length === 0 ? <Empty text={board.expansionBudgets.length ? "No expansion plans match this stage." : "No expansion budgets yet. Add the first future plan."} /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Timeline</th>
                <th className="px-4 py-3 text-right">Requirement</th>
                <th className="px-4 py-3 text-right">Committed</th>
                <th className="px-4 py-3 text-right">Funding gap</th>
                <th className="px-4 py-3">Readiness</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((budget) => {
                const requirement = expansionRequirement(budget);
                const fundingGap = expansionFundingGap(budget);
                const funded = requirement > 0 ? Math.min(100, Math.round((Number(budget.committed_amount || 0) / requirement) * 100)) : 0;
                return (
                  <tr key={budget.id} className="align-middle transition hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><Building2 className="h-4 w-4" /></span>
                        <div className="min-w-0">
                          <p className="max-w-[310px] truncate font-semibold text-[#07133B]" title={budget.title}>{budget.title}</p>
                          <p className="mt-0.5 max-w-[310px] truncate text-xs text-slate-400">
                            {EXPANSION_TYPE_LABELS[budget.expansion_type]}{budget.location ? ` · ${budget.location}` : ""}{budget.owner ? ` · ${budget.owner}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <p>{boardDate(budget.target_start)}</p>
                      <p className="mt-0.5 text-slate-400">to {budget.target_end ? boardDate(budget.target_end) : "open"}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700"><Money amount={requirement} currency={budget.currency} /></td>
                    <td className="px-4 py-3 text-right text-slate-600"><Money amount={budget.committed_amount} currency={budget.currency} /></td>
                    <td className="px-4 py-3 text-right"><Money amount={fundingGap} currency={budget.currency} tone="font-semibold text-[#07133B]" /></td>
                    <td className="px-4 py-3">
                      <div className="w-32">
                        <div className="flex items-center justify-between text-[11px] text-slate-400"><span>Funded</span><span>{funded}%</span></div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0A4FE8]" style={{ width: `${funded}%` }} /></div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5"><Badge value={budget.status} /><Badge value={budget.priority} /></div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => void exportBoardToPdf(expansionBudgetPdf(budget, view))} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-[#0A4FE8]" aria-label={`Download ${budget.title} with its implementation plan`} title="Download this plan and how it is meant to be carried out"><Download className="h-4 w-4" /></button>
                        <button type="button" onClick={() => edit(budget)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#0A4FE8]" aria-label={`Edit ${budget.title}`}><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => void remove(budget)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${budget.title}`}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <Modal title={draft.id ? "Edit expansion budget" : "New expansion budget"} onClose={close}>
          {restoredDraft && (
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Your unfinished expansion budget was restored from the server.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Plan title"><input className={inputClass} value={draft.title || ""} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Open a West Africa operations hub" autoFocus /></Field></div>
            <Field label="Expansion type">
              <select className={inputClass} value={draft.expansion_type || "new_market"} onChange={(event) => setDraft({ ...draft, expansion_type: event.target.value as ExpansionBudget["expansion_type"] })}>
                {EXPANSION_BUDGET_TYPES.map((type) => <option key={type} value={type}>{EXPANSION_TYPE_LABELS[type]}</option>)}
              </select>
            </Field>
            <Field label="Stage">
              <select className={inputClass} value={draft.status || "idea"} onChange={(event) => setDraft({ ...draft, status: event.target.value as ExpansionBudget["status"] })}>
                {EXPANSION_BUDGET_STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select className={inputClass} value={draft.priority || "medium"} onChange={(event) => setDraft({ ...draft, priority: event.target.value as ExpansionBudget["priority"] })}>
                {EXPANSION_BUDGET_PRIORITIES.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}
              </select>
            </Field>
            <Field label="Location or market"><input className={inputClass} value={draft.location || ""} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Accra, Ghana" /></Field>
            <Field label="Planned start"><input type="date" className={inputClass} value={draft.target_start || ""} onChange={(event) => setDraft({ ...draft, target_start: event.target.value })} /></Field>
            <Field label="Planned completion"><input type="date" className={inputClass} value={draft.target_end || ""} min={draft.target_start || undefined} onChange={(event) => setDraft({ ...draft, target_end: event.target.value })} /></Field>
            <Field label="Owner"><input className={inputClass} value={draft.owner || ""} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} placeholder="Executive owner" /></Field>
            <Field label="Currency">
              <select className={inputClass} value={draft.currency || "USD"} onChange={(event) => setDraft({ ...draft, currency: event.target.value })}>
                {BOARD_VIEW_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </Field>
            <Field label="Estimated budget"><input type="number" min="0" step="0.01" className={inputClass} value={String(draft.estimated_amount ?? 0)} onChange={(event) => setDraft({ ...draft, estimated_amount: Number(event.target.value) })} /></Field>
            <Field label="Contingency"><input type="number" min="0" step="0.01" className={inputClass} value={String(draft.contingency_amount ?? 0)} onChange={(event) => setDraft({ ...draft, contingency_amount: Number(event.target.value) })} /></Field>
            <Field label="Funding committed"><input type="number" min="0" step="0.01" className={inputClass} value={String(draft.committed_amount ?? 0)} onChange={(event) => setDraft({ ...draft, committed_amount: Number(event.target.value) })} /></Field>
            <Field label="Funding source"><input className={inputClass} value={draft.funding_source || ""} onChange={(event) => setDraft({ ...draft, funding_source: event.target.value })} placeholder="Retained earnings, facility, investor" /></Field>
            <div className="sm:col-span-2"><Field label="Business rationale"><textarea rows={3} className={areaClass} value={draft.rationale || ""} onChange={(event) => setDraft({ ...draft, rationale: event.target.value })} placeholder="Why this expansion matters and why the timing is right" /></Field></div>
            <div className="sm:col-span-2"><Field label="Expected outcome"><textarea rows={3} className={areaClass} value={draft.expected_outcome || ""} onChange={(event) => setDraft({ ...draft, expected_outcome: event.target.value })} placeholder="Revenue, reach, capacity, or strategic result expected" /></Field></div>
            <div className="sm:col-span-2"><Field label="Notes"><textarea rows={3} className={areaClass} value={draft.notes || ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Dependencies, assumptions, or board considerations" /></Field></div>
          </div>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => void discard()} className="text-xs font-semibold text-slate-500 hover:text-rose-600">Discard draft</button>
              <span className={`text-xs ${draftState === "error" ? "text-rose-600" : "text-slate-400"}`}>
                {draftState === "saving" ? "Saving draft…" : draftState === "saved" ? "Draft saved" : draftState === "error" ? "Draft could not be saved" : "Changes autosave"}
              </span>
            </div>
            <button type="button" onClick={save} disabled={busy === "expansion-budget" || !draft.title?.trim() || !draft.target_start} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-50">
              {busy === "expansion-budget" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save expansion budget
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------- Targets ------------------------------- */

const emptyTarget = (): Partial<Target> => ({
  title: "", metric: "", unit: "", target_value: 0, current_value: 0,
  status: "on_track", owner: "", notes: "", model_id: null,
});

/** "September 2026" from a period_month date. */
function monthLabel(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * The whole board in one line: everything being aimed at, what has landed, and
 * what is still outstanding. Only money targets are added together - see
 * summariseTargets - and anything measured in something else is reported as a
 * count beside the totals rather than folded into them.
 */
function TargetsSummary({ summary }: { summary: ReturnType<typeof summariseTargets> }) {
  const figure = (amount: number) => formatMoney(amount, summary.currency);
  return (
    <Card className="border-[#0A4FE8]/15 bg-gradient-to-br from-[#F5F8FF] to-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0A4FE8]">Where every target stands</p>
          <p className="mt-1 text-xs text-slate-500">
            {summary.monetary} money target{summary.monetary === 1 ? "" : "s"} added up in {summary.currency}
            {summary.nonMonetary > 0 && `, plus ${summary.nonMonetary} measured in something else and tracked separately`}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{summary.achievedCount} achieved</span>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[#0A4FE8]">{summary.onTrackCount} on track</span>
          <span className={`rounded-full px-2.5 py-1 ${summary.atRiskCount ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"}`}>{summary.atRiskCount} needing attention</span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-semibold text-slate-500">Total target</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-[#07133B] sm:text-3xl">{figure(summary.goal)}</p>
        </div>
        <div className="sm:border-l sm:border-slate-200 sm:ps-4">
          <p className="text-[11px] font-semibold text-slate-500">Achieved so far</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-emerald-700 sm:text-3xl">{figure(summary.achieved)}</p>
        </div>
        <div className="sm:border-l sm:border-slate-200 sm:ps-4">
          <p className="text-[11px] font-semibold text-slate-500">Still pending</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-[#07133B] sm:text-3xl">{figure(summary.pending)}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white ring-1 ring-inset ring-slate-200">
          <div className="h-full rounded-full bg-[#0A4FE8] transition-[width] duration-500" style={{ width: `${summary.progress}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {summary.progress}% of the total reached{summary.goal <= 0 ? ". No money target has a figure against it yet." : ""}
        </p>
      </div>
    </Card>
  );
}

function Targets({ board, busy, run }: { board: Board; busy: string; run: Run }) {
  const view = useBoardCurrency();
  const [draft, setDraft] = useState<Partial<Target> | null>(null);
  // A blank form on every "new", with the last unsaved attempt offered beside it.
  const recovery = useUnsavedDraft<Partial<Target>>({
    key: "target",
    draft,
    isNew: Boolean(draft) && !draft?.id,
    blank: emptyTarget(),
    onResume: setDraft,
  });

  const save = async () => {
    if (!draft) return;
    const done = await run("/api/admin/executive-board", { action: "save_target", ...draft }, "target", "Target saved.");
    if (done) { recovery.clear(); setDraft(null); }
  };

  const summary = useMemo(() => summariseTargets(board.targets, view), [board.targets, view]);

  return (
    <div className="space-y-4">
      {board.targets.length > 0 && <TargetsSummary summary={summary} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Every active revenue model carries a monthly target automatically. Fill in the progress; the figure and the name follow the model.
        </p>
        <button type="button" onClick={() => setDraft(emptyTarget())} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-sm font-bold text-white">
          <Plus className="h-4 w-4" /> New target
        </button>
      </div>

      {board.targets.length === 0 ? <Empty text="No targets set yet." /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {board.targets.map((target) => {
            const progress = targetProgress(target);
            const model = board.models.find((m) => m.id === target.model_id);
            return (
              <Card key={target.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-bold text-[#07133B]">
                      <span className="truncate">{target.title}</span>
                      {target.source === "revenue_model" && <Rocket className="h-3.5 w-3.5 shrink-0 text-[#0A4FE8]" aria-label="From a revenue model" />}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {target.source === "revenue_model"
                        ? `From revenue model${target.period_month ? ` · ${monthLabel(target.period_month)}` : ""}`
                        : `${target.metric || "No metric"}${model ? ` · ${model.name}` : ""}`}
                    </p>
                  </div>
                  <Badge value={target.status} />
                </div>
                <p className="mt-3 text-2xl font-black tracking-tight text-[#07133B]">
                  {Number(target.current_value || 0).toLocaleString()}
                  <span className="text-sm font-semibold text-slate-400"> / {Number(target.target_value || 0).toLocaleString()} {target.unit}</span>
                </p>
                {/* A target is money only when its unit names a currency; a
                    headcount or a percentage has no counterpart to show. */}
                {(() => {
                  const unitCurrency = currencyUnit(target.unit);
                  if (!unitCurrency || unitCurrency === view) return null;
                  const current = formatMoneyView(target.current_value, unitCurrency, view);
                  const goal = formatMoneyView(target.target_value, unitCurrency, view);
                  return <p className="mt-0.5 text-xs font-medium text-slate-400">{current.primary} / {goal.primary}</p>;
                })()}
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#0A4FE8]" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>{target.due_on ? `Due ${target.due_on}` : "No due date"}{target.owner ? ` · ${target.owner}` : ""}</span>
                  <span className="flex gap-1">
                    <button type="button" onClick={() => setDraft(target)} className="rounded p-1 hover:bg-slate-100" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                    {target.source !== "revenue_model" && (
                      <button type="button" onClick={() => run("/api/admin/executive-board", { action: "delete_target", id: target.id }, "target", "Target removed.")} className="rounded p-1 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {draft && (
        <Modal title={draft.id ? "Edit target" : "New target"} onClose={() => setDraft(null)}>
          <UnsavedDraftNotice<Partial<Target>>
            recovery={recovery}
            label="target"
            describe={(item) => item.title || ""}
          />
          {draft.source === "revenue_model" && (
            <p className="mb-3 rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-[#07133B]">
              This target comes from the {draft.title} revenue model{draft.period_month ? ` for ${monthLabel(draft.period_month)}` : ""}. Its name, unit and monthly figure follow the model, so edit those on the revenue model itself. Progress, status, owner and notes are yours.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Title"><input className={inputClass} disabled={draft.source === "revenue_model"} value={draft.title || ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Annual recurring revenue" /></Field></div>
            <Field label="Metric"><input className={inputClass} disabled={draft.source === "revenue_model"} value={draft.metric || ""} onChange={(e) => setDraft({ ...draft, metric: e.target.value })} placeholder="Signed retainers" /></Field>
            <Field label="Unit"><input className={inputClass} disabled={draft.source === "revenue_model"} value={draft.unit || ""} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="clients" /></Field>
            <Field label="Target value"><input type="number" step="0.01" className={inputClass} disabled={draft.source === "revenue_model"} value={String(draft.target_value ?? 0)} onChange={(e) => setDraft({ ...draft, target_value: Number(e.target.value) })} /></Field>
            <Field label="Current value"><input type="number" step="0.01" className={inputClass} value={String(draft.current_value ?? 0)} onChange={(e) => setDraft({ ...draft, current_value: Number(e.target.value) })} /></Field>
            <Field label="Due"><input type="date" className={inputClass} value={draft.due_on || ""} onChange={(e) => setDraft({ ...draft, due_on: e.target.value })} /></Field>
            <Field label="Owner"><input className={inputClass} value={draft.owner || ""} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} /></Field>
            <Field label="Status">
              <select className={inputClass} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Target["status"] })}>
                {TARGET_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </Field>
            <Field label="Revenue model">
              <select className={inputClass} value={draft.model_id || ""} onChange={(e) => setDraft({ ...draft, model_id: e.target.value || null })}>
                <option value="">Not linked</option>
                {board.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2"><Field label="Notes"><textarea rows={3} className={areaClass} value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field></div>
          </div>
          <button type="button" onClick={save} disabled={busy === "target" || !draft.title} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-bold text-white disabled:opacity-50">
            {busy === "target" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save target
          </button>
        </Modal>
      )}
    </div>
  );
}

/* --------------------------- Revenue models --------------------------- */

const emptyModel = (): Partial<RevenueModel> => ({
  name: "", summary: "", pricing_basis: "", status: "exploring",
  currency: "USD", target_annual_value: 0, target_monthly_value: 0, owner: "", position: 0,
});

function Models({ board, busy, run }: { board: Board; busy: string; run: Run }) {
  const view = useBoardCurrency();
  const [draft, setDraft] = useState<Partial<RevenueModel> | null>(null);
  // A blank form on every "new", with the last unsaved attempt offered beside it.
  const recovery = useUnsavedDraft<Partial<RevenueModel>>({
    key: "model",
    draft,
    isNew: Boolean(draft) && !draft?.id,
    blank: emptyModel(),
    onResume: setDraft,
  });
  const [stepDraft, setStepDraft] = useState<(Partial<RevenueStep> & { model_id: string }) | null>(null);
  const [open, setOpen] = useState<string[]>([]);

  const toggle = (id: string) => setOpen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const saveModel = async () => {
    if (!draft) return;
    const done = await run("/api/admin/executive-board", { action: "save_model", ...draft }, "model", "Revenue model saved.");
    if (done) { recovery.clear(); setDraft(null); }
  };

  const saveStep = async () => {
    if (!stepDraft) return;
    const done = await run("/api/admin/executive-board", { action: "save_step", ...stepDraft }, "step", "Step saved.");
    if (done) setStepDraft(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setDraft(emptyModel())} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-sm font-bold text-white">
          <Plus className="h-4 w-4" /> New revenue model
        </button>
      </div>

      {board.models.length === 0 ? <Empty text="No revenue models yet." /> : (
        <div className="space-y-3">
          {board.models.map((model) => {
            const expanded = open.includes(model.id);
            const progress = planProgress(model.steps);
            return (
              <Card key={model.id} className="!p-0">
                <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
                  <button type="button" onClick={() => toggle(model.id)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    <span className="mt-0.5 text-slate-300">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[#07133B]">{model.name}</span>
                        <Badge value={model.status} />
                      </span>
                      {model.summary && <span className="mt-0.5 block text-sm text-slate-500">{model.summary}</span>}
                      <span className="mt-1 block text-xs text-slate-400">
                        {formatMoneyView(model.target_monthly_value, model.currency, view).primary}/mo
                        {" · "}
                        {formatMoneyView(model.target_annual_value, model.currency, view).primary}/yr
                        {model.pricing_basis ? ` · ${model.pricing_basis}` : ""}
                        {model.owner ? ` · ${model.owner}` : ""}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{progress}% of {model.steps.length}</span>
                    <button type="button" onClick={() => setDraft(model)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => run("/api/admin/executive-board", { action: "delete_model", id: model.id }, "model", "Revenue model removed.")} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-slate-100 p-4 sm:p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-[#07133B]">Execution plan</h3>
                      <button type="button" onClick={() => setStepDraft({ model_id: model.id, title: "", status: "todo" })} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-bold text-[#0A4FE8] hover:bg-blue-50">
                        <Plus className="h-3.5 w-3.5" /> Add step
                      </button>
                    </div>
                    {model.steps.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">No steps yet. Add the first one.</p>
                    ) : (
                      <ol className="space-y-2">
                        {model.steps.map((step, index) => (
                          <li key={step.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-50 text-[11px] font-bold text-[#0A4FE8]">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-[#07133B]">{step.title}</p>
                                <Badge value={step.status} />
                              </div>
                              {step.detail && <p className="mt-0.5 text-sm text-slate-500">{step.detail}</p>}
                              {(step.owner || step.due_on) && (
                                <p className="mt-1 text-xs text-slate-400">{[step.owner, step.due_on ? `due ${step.due_on}` : ""].filter(Boolean).join(" · ")}</p>
                              )}
                            </div>
                            <span className="flex shrink-0 gap-1">
                              <button type="button" onClick={() => setStepDraft({ ...step, model_id: model.id })} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Edit step"><Pencil className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => run("/api/admin/executive-board", { action: "delete_step", id: step.id }, "step", "Step removed.")} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete step"><Trash2 className="h-3.5 w-3.5" /></button>
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {draft && (
        <Modal title={draft.id ? "Edit revenue model" : "New revenue model"} onClose={() => setDraft(null)}>
          <UnsavedDraftNotice<Partial<RevenueModel>>
            recovery={recovery}
            label="revenue model"
            describe={(item) => item.name || ""}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Name"><input className={inputClass} value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Brand systems retainer" /></Field></div>
            <div className="sm:col-span-2"><Field label="Summary"><textarea rows={3} className={areaClass} value={draft.summary || ""} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} placeholder="What this model is and who it serves" /></Field></div>
            <div className="sm:col-span-2"><Field label="Pricing basis"><input className={inputClass} value={draft.pricing_basis || ""} onChange={(e) => setDraft({ ...draft, pricing_basis: e.target.value })} placeholder="Monthly retainer, per seat, per project" /></Field></div>
            <Field label="Status">
              <select className={inputClass} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as RevenueModel["status"] })}>
                {MODEL_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </Field>
            <Field label="Owner"><input className={inputClass} value={draft.owner || ""} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} /></Field>
            <Field label="Currency">
              <select className={inputClass} value={draft.currency || "USD"} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
                {BOARD_VIEW_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </Field>
            <Field label="Monthly target">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={String(draft.target_monthly_value ?? 0)}
                // Typing a monthly figure fills the annual one for you. Either
                // stays editable afterwards, so a phased ramp that is not a
                // clean twelfth can still be recorded.
                onChange={(e) => {
                  const monthly = Number(e.target.value);
                  setDraft({
                    ...draft,
                    target_monthly_value: monthly,
                    target_annual_value: Math.round(monthly * 12 * 100) / 100,
                  });
                }}
              />
            </Field>
            <Field label="Annual target">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={String(draft.target_annual_value ?? 0)}
                onChange={(e) => {
                  const annual = Number(e.target.value);
                  setDraft({
                    ...draft,
                    target_annual_value: annual,
                    target_monthly_value: Math.round((annual / 12) * 100) / 100,
                  });
                }}
              />
            </Field>
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-400">
                Monthly and annual stay in step as you type. Edit either one on its own afterwards if the year ramps unevenly.
              </p>
            </div>
          </div>
          <button type="button" onClick={saveModel} disabled={busy === "model" || !draft.name} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-bold text-white disabled:opacity-50">
            {busy === "model" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save revenue model
          </button>
        </Modal>
      )}

      {stepDraft && (
        <Modal title={stepDraft.id ? "Edit step" : "Add step"} onClose={() => setStepDraft(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Step"><input className={inputClass} value={stepDraft.title || ""} onChange={(e) => setStepDraft({ ...stepDraft, title: e.target.value })} placeholder="Package the offer and price it" /></Field></div>
            <div className="sm:col-span-2"><Field label="How it gets done"><textarea rows={3} className={areaClass} value={stepDraft.detail || ""} onChange={(e) => setStepDraft({ ...stepDraft, detail: e.target.value })} /></Field></div>
            <Field label="Owner"><input className={inputClass} value={stepDraft.owner || ""} onChange={(e) => setStepDraft({ ...stepDraft, owner: e.target.value })} /></Field>
            <Field label="Due"><input type="date" className={inputClass} value={stepDraft.due_on || ""} onChange={(e) => setStepDraft({ ...stepDraft, due_on: e.target.value })} /></Field>
            <Field label="Status">
              <select className={inputClass} value={stepDraft.status} onChange={(e) => setStepDraft({ ...stepDraft, status: e.target.value as RevenueStep["status"] })}>
                {STEP_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </Field>
          </div>
          <button type="button" onClick={saveStep} disabled={busy === "step" || !stepDraft.title} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-bold text-white disabled:opacity-50">
            {busy === "step" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save step
          </button>
        </Modal>
      )}
    </div>
  );
}

/* -------------------------------- Vault -------------------------------- */

const SOURCE_LABELS: Record<string, string> = {
  cdoc: "cDoc",
  protected_doc: "Protected document",
  legal_doc: "Legal document",
  link: "External link",
  upload: "Uploaded file",
};

function Vault({ board, busy, run, reload, setNotice }: {
  board: Board; busy: string; run: Run; reload: () => Promise<void>;
  setNotice: (value: { tone: "success" | "error"; text: string } | null) => void;
}) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderDraft, setFolderDraft] = useState<(Partial<VaultFolder> & { password?: string; clear_password?: boolean }) | null>(null);
  const [fileDraft, setFileDraft] = useState<(Partial<VaultFile> & { password?: string; clear_password?: boolean }) | null>(null);
  const [uploading, setUploading] = useState(false);
  const [upload, setUpload] = useState<{ file: File | null; title: string; kind: string; description: string; password: string } | null>(null);
  const [attach, setAttach] = useState<{
    tab: "cdoc" | "protected_doc" | "legal_doc" | "link";
    source_id: string; link_url: string; title: string; kind: string; description: string; password: string;
  } | null>(null);
  const [attachable, setAttachable] = useState<{ cdocs: any[]; protectedDocs: any[]; legalDocs: any[] } | null>(null);
  const [attachSearch, setAttachSearch] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [share, setShare] = useState<{ file_id?: string; folder_id?: string; name: string; password: string; recipient_email: string; note: string; expires_in_days: string; max_downloads: string } | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const folders = board.folders.filter((f) => (f.parent_id || null) === folderId);
  const files = board.files.filter((f) => (f.folder_id || null) === folderId);
  const current = board.folders.find((f) => f.id === folderId) || null;

  // Breadcrumb from the current folder back to the root.
  const trail = useMemo(() => {
    const path: VaultFolder[] = [];
    let cursor = current;
    for (let depth = 0; cursor && depth < 12; depth++) {
      path.unshift(cursor);
      cursor = board.folders.find((f) => f.id === cursor?.parent_id) || null;
    }
    return path;
  }, [current, board.folders]);

  const sharesFor = (fileId: string) => board.shares.filter((s) => s.file_id === fileId && shareIsLive(s));

  // The picker lists what already exists in the system, so a document is
  // referenced rather than copied into the vault a second time.
  useEffect(() => {
    if (!attach || attach.tab === "link") return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/executive-board/vault?resource=attachable&q=${encodeURIComponent(attachSearch)}`, { cache: "no-store" });
        const json = await response.json().catch(() => ({}));
        if (!cancelled && json.ok) setAttachable({ cdocs: json.cdocs || [], protectedDocs: json.protectedDocs || [], legalDocs: json.legalDocs || [] });
      } catch { /* the picker simply stays empty */ }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [attach, attachSearch]);

  const doAttach = async () => {
    if (!attach) return;
    setAttaching(true); setNotice(null);
    try {
      const response = await fetch("/api/admin/executive-board/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "attach_document",
          source_kind: attach.tab,
          source_id: attach.source_id || undefined,
          link_url: attach.link_url || undefined,
          title: attach.title,
          kind: attach.kind,
          description: attach.description,
          password: attach.password || undefined,
          folder_id: folderId || undefined,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "The document could not be attached.");
      setAttach(null); setAttachSearch("");
      await reload();
      setNotice({ tone: "success", text: "Document attached." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "The document could not be attached." });
    } finally {
      setAttaching(false);
    }
  };

  const doUpload = async () => {
    if (!upload?.file) return;
    setUploading(true); setNotice(null);
    try {
      const data = new FormData();
      data.append("file", upload.file);
      data.append("title", upload.title || upload.file.name);
      data.append("kind", upload.kind);
      data.append("description", upload.description);
      if (upload.password) data.append("password", upload.password);
      if (folderId) data.append("folder_id", folderId);
      const response = await fetch("/api/admin/executive-board/vault", { method: "POST", body: data });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "Upload failed.");
      setUpload(null);
      await reload();
      setNotice({ tone: "success", text: "File uploaded." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  };

  const createShare = async () => {
    if (!share) return;
    const json = await run("/api/admin/executive-board/vault", {
      action: "create_share",
      file_id: share.file_id,
      folder_id: share.folder_id,
      password: share.password || undefined,
      recipient_email: share.recipient_email || undefined,
      note: share.note || undefined,
      expires_in_days: Number(share.expires_in_days) || 0,
      max_downloads: Number(share.max_downloads) || 0,
    }, "share", "Share link created.");
    if (json?.url) { setShareUrl(json.url); setCopied(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
          <button type="button" onClick={() => setFolderId(null)} className="rounded px-1.5 py-0.5 font-semibold hover:bg-slate-100">Vault</button>
          {trail.map((folder) => (
            <span key={folder.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              <button type="button" onClick={() => setFolderId(folder.id)} className="rounded px-1.5 py-0.5 font-semibold hover:bg-slate-100">{folder.name}</button>
            </span>
          ))}
        </nav>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFolderDraft({ parent_id: folderId, name: "" })} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
            <FolderPlus className="h-4 w-4" /> New folder
          </button>
          <button type="button" onClick={() => { setAttach({ tab: "cdoc", source_id: "", link_url: "", title: "", kind: "attachment", description: "", password: "" }); setAttachSearch(""); }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
            <Paperclip className="h-4 w-4" /> Attach document
          </button>
          <button type="button" onClick={() => setUpload({ file: null, title: "", kind: "attachment", description: "", password: "" })} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-sm font-bold text-white">
            <Upload className="h-4 w-4" /> Upload file
          </button>
        </div>
      </div>

      {current?.has_password && (
        <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <Lock className="h-4 w-4 shrink-0" /> This folder is password protected. Everything inside it inherits that password unless a file sets its own.
        </p>
      )}

      {folders.length === 0 && files.length === 0 ? <Empty text="This folder is empty." /> : (
        <div className="space-y-3">
          {folders.map((folder) => (
            <Card key={folder.id} className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setFolderId(folder.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><Folder className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-bold text-[#07133B]">{folder.name}</span>
                    {folder.has_password && <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                  </span>
                  {folder.description && <span className="block truncate text-xs text-slate-400">{folder.description}</span>}
                </span>
              </button>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => setShare({ folder_id: folder.id, name: folder.name, password: "", recipient_email: "", note: "", expires_in_days: "7", max_downloads: "" })} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Share folder"><Link2 className="h-4 w-4" /></button>
                <button type="button" onClick={() => setFolderDraft(folder)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Edit folder"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => run("/api/admin/executive-board/vault", { action: "delete_folder", id: folder.id }, "vault", "Folder removed.")} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete folder"><Trash2 className="h-4 w-4" /></button>
              </div>
            </Card>
          ))}

          {files.map((file) => {
            const live = sharesFor(file.id);
            return (
              <Card key={file.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                    {file.source_kind === "link" ? <ExternalLink className="h-5 w-5" />
                      : file.source_kind === "cdoc" ? <ScrollText className="h-5 w-5" />
                        : file.source_kind && file.source_kind !== "upload" ? <Paperclip className="h-5 w-5" />
                          : <FileText className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold text-[#07133B]">{file.title}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{KIND_LABELS[file.kind] || file.kind}</span>
                      {file.has_password
                        ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600"><Lock className="h-3 w-3" /> Password</span>
                        : file.inherits_password
                          ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-500"><Lock className="h-3 w-3" /> Folder password</span>
                          : <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-300"><Unlock className="h-3 w-3" /> Open</span>}
                      {live.length > 0 && <span className="text-[11px] font-bold text-[#0A4FE8]">{live.length} live link{live.length === 1 ? "" : "s"}</span>}
                    </div>
                    <p className="truncate text-xs text-slate-400">
                      {file.source_kind === "link" ? file.link_url
                        : file.source_kind && file.source_kind !== "upload"
                          ? `${SOURCE_LABELS[file.source_kind]} · opens where it lives`
                          : `${file.file_name} · ${formatBytes(file.file_size_bytes)}`}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <a
                    href={`/api/admin/executive-board/vault?file=${file.id}`}
                    target={file.source_kind && file.source_kind !== "upload" ? "_blank" : undefined}
                    rel={file.source_kind && file.source_kind !== "upload" ? "noopener noreferrer" : undefined}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                    aria-label={file.source_kind && file.source_kind !== "upload" ? "Open" : "Download"}
                  >
                    {file.source_kind && file.source_kind !== "upload" ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  </a>
                  <button type="button" onClick={() => setShare({ file_id: file.id, name: file.title, password: "", recipient_email: "", note: "", expires_in_days: "7", max_downloads: "" })} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Share"><Link2 className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setFileDraft(file)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => run("/api/admin/executive-board/vault", { action: "delete_file", id: file.id }, "vault", "File removed.")} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {board.shares.some(shareIsLive) && (
        <Card>
          <h2 className="text-sm font-bold text-[#07133B]">Live share links</h2>
          <div className="mt-3 space-y-2">
            {board.shares.filter(shareIsLive).map((entry) => {
              const target = entry.file_id
                ? board.files.find((f) => f.id === entry.file_id)?.title
                : board.folders.find((f) => f.id === entry.folder_id)?.name;
              return (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#07133B]">{target || "Removed item"}</p>
                    <p className="truncate text-xs text-slate-400">
                      {entry.recipient_email || "No recipient noted"}
                      {entry.expires_at ? ` · expires ${new Date(entry.expires_at).toLocaleDateString()}` : " · no expiry"}
                      {` · ${entry.download_count}${entry.max_downloads ? `/${entry.max_downloads}` : ""} downloads`}
                      {entry.has_password ? " · own password" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/vault/${entry.token}`); setNotice({ tone: "success", text: "Link copied." }); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Copy link"><Copy className="h-4 w-4" /></button>
                    <button type="button" onClick={() => run("/api/admin/executive-board/vault", { action: "revoke_share", id: entry.id }, "vault", "Share link revoked.")} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600">Revoke</button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ----- Folder modal ----- */}
      {folderDraft && (
        <Modal title={folderDraft.id ? "Edit folder" : "New folder"} onClose={() => setFolderDraft(null)}>
          <div className="space-y-3">
            <Field label="Name"><input className={inputClass} value={folderDraft.name || ""} onChange={(e) => setFolderDraft({ ...folderDraft, name: e.target.value })} placeholder="Board resolutions" /></Field>
            <Field label="Description"><textarea rows={2} className={areaClass} value={folderDraft.description || ""} onChange={(e) => setFolderDraft({ ...folderDraft, description: e.target.value })} /></Field>
            <Field label={folderDraft.has_password ? "Replace password" : "Password (optional)"}>
              <input type="password" className={inputClass} value={folderDraft.password || ""} onChange={(e) => setFolderDraft({ ...folderDraft, password: e.target.value, clear_password: false })} placeholder={folderDraft.has_password ? "Leave empty to keep the current one" : "Locks every file inside"} />
            </Field>
            {folderDraft.has_password && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={!!folderDraft.clear_password} onChange={(e) => setFolderDraft({ ...folderDraft, clear_password: e.target.checked, password: "" })} />
                Remove the password from this folder
              </label>
            )}
          </div>
          <button
            type="button"
            onClick={async () => {
              const done = await run("/api/admin/executive-board/vault", { action: "save_folder", ...folderDraft }, "vault", "Folder saved.");
              if (done) setFolderDraft(null);
            }}
            disabled={busy === "vault" || !folderDraft.name}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-bold text-white disabled:opacity-50"
          >
            {busy === "vault" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save folder
          </button>
        </Modal>
      )}

      {/* ----- Attach existing document, cDoc, or external link ----- */}
      {attach && (
        <Modal title="Attach document" onClose={() => setAttach(null)}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 p-1">
              {([
                ["cdoc", "cDoc", ScrollText],
                ["protected_doc", "Protected doc", ShieldCheck],
                ["legal_doc", "Legal", Landmark],
                ["link", "External link", ExternalLink],
              ] as const).map(([tab, label, Icon]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setAttach({ ...attach, tab, source_id: "", title: "" })}
                  className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold ${attach.tab === tab ? "bg-[#0A4FE8] text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>

            {attach.tab === "link" ? (
              <Field label="Document link">
                <input
                  className={inputClass}
                  value={attach.link_url}
                  onChange={(e) => setAttach({ ...attach, link_url: e.target.value })}
                  placeholder="https://drive.google.com/file/..."
                />
                <p className="mt-1 text-xs text-slate-400">The vault keeps the link, not a copy, so it always opens the current version.</p>
              </Field>
            ) : (
              <Field label="Choose a document">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
                  <input
                    className={`${inputClass} pl-9`}
                    value={attachSearch}
                    onChange={(e) => setAttachSearch(e.target.value)}
                    placeholder="Search by title"
                  />
                </div>
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1">
                  {(() => {
                    const rows = attach.tab === "cdoc" ? attachable?.cdocs
                      : attach.tab === "protected_doc" ? attachable?.protectedDocs
                        : attachable?.legalDocs;
                    if (!rows) return <p className="px-2 py-3 text-xs text-slate-400">Loading documents.</p>;
                    if (!rows.length) return <p className="px-2 py-3 text-xs text-slate-400">Nothing here yet to attach.</p>;
                    return rows.map((row: any) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setAttach({ ...attach, source_id: String(row.id), title: attach.title || row.title })}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${String(row.id) === attach.source_id ? "bg-[#0A4FE8]/10 text-[#07133B]" : "hover:bg-slate-50"}`}
                      >
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{row.title}</span>
                          <span className="block truncate text-xs text-slate-400">
                            {row.department || row.description || row.slug || ""}
                          </span>
                        </span>
                        {String(row.id) === attach.source_id && <Check className="h-4 w-4 shrink-0 text-[#0A4FE8]" />}
                      </button>
                    ));
                  })()}
                </div>
              </Field>
            )}

            <Field label="Title"><input className={inputClass} value={attach.title} onChange={(e) => setAttach({ ...attach, title: e.target.value })} placeholder="Shown in the vault" /></Field>
            <Field label="Kind">
              <select className={inputClass} value={attach.kind} onChange={(e) => setAttach({ ...attach, kind: e.target.value })}>
                {VAULT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </select>
            </Field>
            <Field label="Description"><textarea rows={2} className={areaClass} value={attach.description} onChange={(e) => setAttach({ ...attach, description: e.target.value })} /></Field>
            <Field label="Password (optional)">
              <input type="password" className={inputClass} value={attach.password} onChange={(e) => setAttach({ ...attach, password: e.target.value })} placeholder="Needed to open this entry from a share link" />
            </Field>
            {folderId && <p className="text-xs text-slate-400">Attaching into {current?.name}.</p>}
            {attach.tab !== "link" && (
              <p className="text-xs text-slate-400">A document held inside CDS Space opens for signed-in staff. Share links cannot carry it out of the building, so use an uploaded copy or an external link for anyone outside.</p>
            )}
          </div>
          <button
            type="button"
            onClick={doAttach}
            disabled={attaching || (attach.tab === "link" ? !attach.link_url.trim() : !attach.source_id)}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-bold text-white disabled:opacity-50"
          >
            {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />} Attach
          </button>
        </Modal>
      )}

      {/* ----- Upload modal ----- */}
      {upload && (
        <Modal title="Upload file" onClose={() => setUpload(null)}>
          <div className="space-y-3">
            <Field label="File">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 px-3 py-3 transition hover:border-[#0A4FE8] hover:bg-[#0A4FE8]/[0.03]">
                <input
                  type="file"
                  className="sr-only"
                  onChange={(e) => { const chosen = e.target.files?.[0] || null; setUpload({ ...upload, file: chosen, title: upload.title || (chosen?.name ?? "") }); }}
                />
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#0A4FE8]/10 text-[#0A4FE8]">
                  <Upload className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-700">
                    {upload.file ? "Change file" : "Choose a file"}
                  </span>
                  <span className="block truncate text-xs text-slate-400">
                    {upload.file ? `${upload.file.name} - ${formatBytes(upload.file.size)}` : "No file chosen yet"}
                  </span>
                </span>
              </label>
            </Field>
            <Field label="Title"><input className={inputClass} value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} /></Field>
            <Field label="Kind">
              <select className={inputClass} value={upload.kind} onChange={(e) => setUpload({ ...upload, kind: e.target.value })}>
                {VAULT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </select>
            </Field>
            <Field label="Description"><textarea rows={2} className={areaClass} value={upload.description} onChange={(e) => setUpload({ ...upload, description: e.target.value })} /></Field>
            <Field label="Password (optional)">
              <input type="password" className={inputClass} value={upload.password} onChange={(e) => setUpload({ ...upload, password: e.target.value })} placeholder="Needed to open this file from a share link" />
            </Field>
            {folderId && <p className="text-xs text-slate-400">Uploading into {current?.name}.</p>}
          </div>
          <button type="button" onClick={doUpload} disabled={uploading || !upload.file} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-bold text-white disabled:opacity-50">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
          </button>
        </Modal>
      )}

      {/* ----- File edit modal ----- */}
      {fileDraft && (
        <Modal title="Edit file" onClose={() => setFileDraft(null)}>
          <div className="space-y-3">
            <Field label="Title"><input className={inputClass} value={fileDraft.title || ""} onChange={(e) => setFileDraft({ ...fileDraft, title: e.target.value })} /></Field>
            <Field label="Kind">
              <select className={inputClass} value={fileDraft.kind} onChange={(e) => setFileDraft({ ...fileDraft, kind: e.target.value as VaultFile["kind"] })}>
                {VAULT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </select>
            </Field>
            <Field label="Folder">
              <select className={inputClass} value={fileDraft.folder_id || ""} onChange={(e) => setFileDraft({ ...fileDraft, folder_id: e.target.value || null })}>
                <option value="">Vault root</option>
                {board.folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="Description"><textarea rows={2} className={areaClass} value={fileDraft.description || ""} onChange={(e) => setFileDraft({ ...fileDraft, description: e.target.value })} /></Field>
            <Field label={fileDraft.has_password ? "Replace password" : "Password (optional)"}>
              <input type="password" className={inputClass} value={fileDraft.password || ""} onChange={(e) => setFileDraft({ ...fileDraft, password: e.target.value, clear_password: false })} placeholder={fileDraft.has_password ? "Leave empty to keep the current one" : ""} />
            </Field>
            {fileDraft.has_password && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={!!fileDraft.clear_password} onChange={(e) => setFileDraft({ ...fileDraft, clear_password: e.target.checked, password: "" })} />
                Remove the password from this file
              </label>
            )}
          </div>
          <button
            type="button"
            onClick={async () => {
              const done = await run("/api/admin/executive-board/vault", { action: "update_file", ...fileDraft }, "vault", "File updated.");
              if (done) setFileDraft(null);
            }}
            disabled={busy === "vault" || !fileDraft.title}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-bold text-white disabled:opacity-50"
          >
            {busy === "vault" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save changes
          </button>
        </Modal>
      )}

      {/* ----- Share modal ----- */}
      {share && (
        <Modal title={`Share ${share.name}`} onClose={() => { setShare(null); setShareUrl(""); }}>
          {shareUrl ? (
            <div>
              <p className="text-sm text-slate-600">Send this link to the recipient. The password is not in the link, so share it separately.</p>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 p-2">
                <input readOnly value={shareUrl} className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" />
                <button
                  type="button"
                  onClick={() => { void navigator.clipboard.writeText(shareUrl); setCopied(true); }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#0A4FE8] px-3 py-2 text-xs font-bold text-white"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <button type="button" onClick={() => { setShare(null); setShareUrl(""); }} className="mt-4 h-11 w-full rounded-xl border border-slate-200 text-sm font-bold text-slate-600">Done</button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <Field label="Password for this link (optional)">
                  <input type="password" className={inputClass} value={share.password} onChange={(e) => setShare({ ...share, password: e.target.value })} placeholder="Leave empty to use the item's own password" />
                </Field>
                <Field label="Recipient email (for your records)"><input type="email" className={inputClass} value={share.recipient_email} onChange={(e) => setShare({ ...share, recipient_email: e.target.value })} /></Field>
                <Field label="Note shown to the recipient"><textarea rows={2} className={areaClass} value={share.note} onChange={(e) => setShare({ ...share, note: e.target.value })} /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Expires in (days)"><input type="number" min={0} max={365} className={inputClass} value={share.expires_in_days} onChange={(e) => setShare({ ...share, expires_in_days: e.target.value })} placeholder="0 for never" /></Field>
                  <Field label="Max downloads"><input type="number" min={0} max={1000} className={inputClass} value={share.max_downloads} onChange={(e) => setShare({ ...share, max_downloads: e.target.value })} placeholder="0 for unlimited" /></Field>
                </div>
                <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  A link with no password anywhere on it is refused. Set one here, or on the file or folder, before sending.
                </p>
              </div>
              <button type="button" onClick={createShare} disabled={busy === "share"} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-bold text-white disabled:opacity-50">
                {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Create share link
              </button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
