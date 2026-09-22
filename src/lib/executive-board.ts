import { USD_RATES } from "@/lib/currency";

// Shared Executive Board model: budgets, targets, revenue models with their
// execution plans, and the document vault. Imported by the admin UI, the admin
// API, and the public share page, so the option lists never drift apart.

export const BUDGET_STATUSES = ["draft", "active", "closed"] as const;
export const BUDGET_CATEGORIES = [
  "operations",
  "people",
  "marketing",
  "technology",
  "legal",
  "capital",
  "other",
] as const;

export const EXPANSION_BUDGET_TYPES = [
  "new_market",
  "new_office",
  "hiring",
  "technology",
  "product",
  "infrastructure",
  "acquisition",
  "other",
] as const;
export const EXPANSION_BUDGET_STATUSES = [
  "idea",
  "researching",
  "planned",
  "approved",
  "on_hold",
  "launched",
  "cancelled",
] as const;
export const EXPANSION_BUDGET_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export const TARGET_STATUSES = ["on_track", "at_risk", "off_track", "achieved"] as const;
export const MODEL_STATUSES = ["exploring", "piloting", "active", "paused", "retired"] as const;
export const STEP_STATUSES = ["todo", "doing", "blocked", "done"] as const;
export const VAULT_KINDS = ["legal", "budget", "target", "revenue", "attachment", "other"] as const;

export type BudgetStatus = (typeof BUDGET_STATUSES)[number];
export type ExpansionBudgetType = (typeof EXPANSION_BUDGET_TYPES)[number];
export type ExpansionBudgetStatus = (typeof EXPANSION_BUDGET_STATUSES)[number];
export type ExpansionBudgetPriority = (typeof EXPANSION_BUDGET_PRIORITIES)[number];
export type TargetStatus = (typeof TARGET_STATUSES)[number];
export type ModelStatus = (typeof MODEL_STATUSES)[number];
export type StepStatus = (typeof STEP_STATUSES)[number];
export type VaultKind = (typeof VAULT_KINDS)[number];

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  closed: "Closed",
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  achieved: "Achieved",
  exploring: "Exploring",
  piloting: "Piloting",
  paused: "Paused",
  retired: "Retired",
  todo: "To do",
  doing: "In progress",
  blocked: "Blocked",
  done: "Done",
  idea: "Idea",
  researching: "Researching",
  planned: "Planned",
  approved: "Approved",
  on_hold: "On hold",
  launched: "Launched",
  cancelled: "Cancelled",
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const EXPANSION_TYPE_LABELS: Record<ExpansionBudgetType, string> = {
  new_market: "New market",
  new_office: "New office",
  hiring: "Team growth",
  technology: "Technology",
  product: "New product",
  infrastructure: "Infrastructure",
  acquisition: "Acquisition",
  other: "Other",
};

export const KIND_LABELS: Record<string, string> = {
  legal: "Legal document",
  budget: "Budget",
  target: "Target",
  revenue: "Revenue model",
  attachment: "Attachment",
  other: "Other",
};

export interface Budget {
  id: string;
  title: string;
  category: string;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  currency: string;
  planned_amount: number;
  actual_amount: number;
  owner: string | null;
  status: BudgetStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpansionBudget {
  id: string;
  title: string;
  expansion_type: ExpansionBudgetType;
  location: string | null;
  rationale: string | null;
  target_start: string;
  target_end: string | null;
  currency: string;
  estimated_amount: number;
  contingency_amount: number;
  committed_amount: number;
  funding_source: string | null;
  owner: string | null;
  priority: ExpansionBudgetPriority;
  status: ExpansionBudgetStatus;
  expected_outcome: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpansionBudgetDraft {
  payload: Partial<ExpansionBudget>;
  updated_at: string;
}

export interface Target {
  id: string;
  title: string;
  metric: string;
  unit: string;
  target_value: number;
  current_value: number;
  due_on: string | null;
  owner: string | null;
  model_id: string | null;
  status: TargetStatus;
  notes: string | null;
  /** manual when someone wrote it, revenue_model when generated from a model. */
  source: "manual" | "revenue_model";
  /** First day of the month a generated target covers. */
  period_month: string | null;
  created_at: string;
  updated_at: string;
}

export interface RevenueStep {
  id: string;
  model_id: string;
  position: number;
  title: string;
  detail: string | null;
  owner: string | null;
  due_on: string | null;
  status: StepStatus;
}

export interface RevenueModel {
  id: string;
  name: string;
  summary: string | null;
  pricing_basis: string | null;
  status: ModelStatus;
  currency: string;
  target_annual_value: number;
  target_monthly_value: number;
  owner: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  steps: RevenueStep[];
}

export interface VaultFolder {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  has_password: boolean;
  created_at: string;
}

export interface VaultFile {
  id: string;
  folder_id: string | null;
  title: string;
  description: string | null;
  kind: VaultKind;
  file_name: string;
  file_mime: string | null;
  file_size_bytes: number;
  /** Where the content lives: an upload, a referenced document, or a link. */
  source_kind: "upload" | "cdoc" | "protected_doc" | "legal_doc" | "link";
  source_id: string | null;
  link_url: string | null;
  has_password: boolean;
  /** True when the file has no password of its own but its folder does. */
  inherits_password: boolean;
  created_at: string;
}

export interface VaultShare {
  id: string;
  token: string;
  file_id: string | null;
  folder_id: string | null;
  recipient_email: string | null;
  note: string | null;
  expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  last_opened_at: string | null;
  revoked_at: string | null;
  created_at: string;
  has_password: boolean;
}

/** Budget variance. Positive means spend is under the plan. */
export function budgetVariance(budget: Pick<Budget, "planned_amount" | "actual_amount">) {
  return Number(budget.planned_amount || 0) - Number(budget.actual_amount || 0);
}

export function expansionRequirement(
  budget: Pick<ExpansionBudget, "estimated_amount" | "contingency_amount">,
) {
  return Number(budget.estimated_amount || 0) + Number(budget.contingency_amount || 0);
}

export function expansionFundingGap(
  budget: Pick<ExpansionBudget, "estimated_amount" | "contingency_amount" | "committed_amount">,
) {
  return Math.max(0, expansionRequirement(budget) - Number(budget.committed_amount || 0));
}

export function targetProgress(target: Pick<Target, "target_value" | "current_value">) {
  const goal = Number(target.target_value || 0);
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(target.current_value || 0) / goal) * 100)));
}

/**
 * The roll-up behind the Targets summary: everything being aimed at, what has
 * landed, and what is still outstanding.
 *
 * Only targets whose unit names a currency are added together, because a
 * headcount, a percentage and a sum of money do not share a scale and adding
 * them would produce a number that means nothing. Everything else is counted
 * and reported separately, so a non-money target is never silently dropped.
 */
export function summariseTargets(targets: Target[], view: BoardViewCurrency) {
  const into = (amount: number, from: string) => convertMoney(amount, from, view) ?? Number(amount || 0);
  let goal = 0;
  let achieved = 0;
  let money = 0;
  for (const target of targets) {
    const unit = currencyUnit(target.unit);
    if (!unit) continue;
    money += 1;
    goal += into(Number(target.target_value || 0), unit);
    // A target beyond its goal still only contributes its goal to the roll-up,
    // so one runaway line cannot mask the rest of the board falling short.
    achieved += Math.min(into(Number(target.current_value || 0), unit), into(Number(target.target_value || 0), unit));
  }
  return {
    currency: view,
    /** How many targets carry a money unit and are therefore in the totals. */
    monetary: money,
    /** Targets left out of the totals because their unit is not money. */
    nonMonetary: targets.length - money,
    total: targets.length,
    goal,
    achieved,
    pending: Math.max(0, goal - achieved),
    progress: goal > 0 ? Math.max(0, Math.min(100, Math.round((achieved / goal) * 100))) : 0,
    achievedCount: targets.filter((target) => target.status === "achieved").length,
    onTrackCount: targets.filter((target) => target.status === "on_track").length,
    atRiskCount: targets.filter((target) => target.status === "at_risk" || target.status === "off_track").length,
  };
}

export function planProgress(steps: Pick<RevenueStep, "status">[]) {
  if (!steps.length) return 0;
  return Math.round((steps.filter((step) => step.status === "done").length / steps.length) * 100);
}

export function formatMoney(amount: number, currency: string) {
  const value = Number(amount || 0);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      // Narrow symbol so the NGN counterpart reads as a symbol rather than the
      // bare code sitting next to a dollar figure.
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency || "USD"} ${value.toLocaleString()}`;
  }
}

/**
 * The board reports every money figure twice: in the currency the line was
 * entered in, and in the other half of the USD/NGN pair. Rates come from the
 * hand-maintained table in @/lib/currency so there is one place to update them.
 */
export const BOARD_BASE_CURRENCY = "USD";
export const BOARD_SECOND_CURRENCY = "NGN";

export function counterpartCurrency(currency: string) {
  return (currency || BOARD_BASE_CURRENCY).toUpperCase() === BOARD_SECOND_CURRENCY
    ? BOARD_BASE_CURRENCY
    : BOARD_SECOND_CURRENCY;
}

/** Returns null when either side has no published rate, so callers can skip it. */
export function convertMoney(amount: number, from: string, to: string): number | null {
  const fromRate = USD_RATES[(from || BOARD_BASE_CURRENCY).toUpperCase()];
  const toRate = USD_RATES[(to || BOARD_BASE_CURRENCY).toUpperCase()];
  if (!fromRate || !toRate) return null;
  return (Number(amount || 0) / fromRate) * toRate;
}

/**
 * A money figure in its own currency plus its counterpart. `secondary` is null
 * when the entered currency is not one we hold a rate for, or when it is
 * already the counterpart itself.
 */
export function formatMoneyDual(amount: number, currency: string) {
  const code = (currency || BOARD_BASE_CURRENCY).toUpperCase();
  const other = counterpartCurrency(code);
  const converted = code === other ? null : convertMoney(amount, code, other);
  return {
    primary: formatMoney(amount, code),
    secondary: converted === null ? null : formatMoney(converted, other),
  };
}

/** True when a target's free-text unit names a currency we can convert. */
export function currencyUnit(unit: string | null | undefined): string | null {
  const code = String(unit || "").trim().toUpperCase();
  return code.length === 3 && USD_RATES[code] ? code : null;
}

/** The two currencies the board can be planned in. */
export const BOARD_VIEW_CURRENCIES = [BOARD_BASE_CURRENCY, BOARD_SECOND_CURRENCY] as const;
export type BoardViewCurrency = (typeof BOARD_VIEW_CURRENCIES)[number];

/**
 * Restates a figure in the currency the board is currently being planned in.
 *
 * `primary` is the amount in the view currency. `note` carries the figure as it
 * was actually entered, and is null when the two match or when there is no
 * published rate to convert with - in that case `primary` falls back to the
 * entered amount so a number is never silently dropped.
 */
export function formatMoneyView(amount: number, entered: string, view: BoardViewCurrency) {
  const from = (entered || BOARD_BASE_CURRENCY).toUpperCase();
  if (from === view) return { primary: formatMoney(amount, view), note: null as string | null };
  const converted = convertMoney(amount, from, view);
  if (converted === null) return { primary: formatMoney(amount, from), note: null as string | null };
  return { primary: formatMoney(converted, view), note: `${formatMoney(amount, from)} as entered` };
}

export function formatBytes(bytes: number) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

/** A share is only usable while it is unrevoked, unexpired, and under its cap. */
export function shareIsLive(share: Pick<VaultShare, "revoked_at" | "expires_at" | "max_downloads" | "download_count">) {
  if (share.revoked_at) return false;
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) return false;
  if (share.max_downloads != null && share.download_count >= share.max_downloads) return false;
  return true;
}
