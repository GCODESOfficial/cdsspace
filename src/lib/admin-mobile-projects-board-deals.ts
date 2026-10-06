import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any */
import jsPDF from "jspdf";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";
import { loadServerPdfImage } from "@/lib/finance/invoice-pdf-server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import {
  BOARD_VIEW_CURRENCIES, BUDGET_MONTH_NAMES, budgetsInPeriod, budgetVariance, budgetYearRollup, convertMoney, currencyUnit,
  expansionFundingGap, expansionRequirement, formatBytes, planProgress, targetProgress,
  EXPANSION_TYPE_LABELS, KIND_LABELS, STATUS_LABELS,
  type BoardViewCurrency, type Budget, type BudgetPeriod, type ExpansionBudget, type RevenueModel, type Target,
  type VaultFile, type VaultFolder,
} from "@/lib/executive-board";

/**
 * Admin app (Executive Board): the board's branded PDFs built on the server, so
 * the app can show them in its native PDF viewer.
 *
 * A server copy of src/lib/executive-board-pdf.ts, which only runs in the
 * browser ("use client": the logo is rasterised through <canvas> and the file is
 * saved with doc.save()). Same layout and the same per-view builders; the logo
 * is read through loadServerPdfImage and the document is returned instead of
 * downloaded. The board data is loaded with the same queries as
 * GET /api/admin/executive-board (its loadBoard is private to that route).
 */

const NAVY: [number, number, number] = [13, 27, 57];
const BLUE: [number, number, number] = [10, 79, 232];
const GREY: [number, number, number] = [107, 114, 128];
const LINE: [number, number, number] = [229, 231, 235];

type Column = { header: string; width: number; align?: "left" | "right" };
type Section = { title: string; columns: Column[]; rows: string[][]; empty: string };
type Headline = { label: string; value: string; hint?: string };

export type BoardPdfInput = {
  view: string;
  title: string;
  subtitle: string;
  currency: BoardViewCurrency;
  headline: Headline[];
  sections: Section[];
  fileName?: string;
};

// The server runs in UTC; the board is read in Lagos.
const TIME_ZONE = "Africa/Lagos";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: TIME_ZONE });
  } catch {
    return "-";
  }
}

export function boardPdfFileName(input: BoardPdfInput) {
  return input.fileName || `CDS-Space-Executive-Board-${input.view}-${new Date().toISOString().slice(0, 10)}.pdf`;
}

/** Renders one board view (exportBoardToPdf, returning the bytes). */
export async function renderBoardPdf(input: BoardPdfInput): Promise<ArrayBuffer> {
  const logo = await loadServerPdfImage("/navbar/CDS Logo.svg", 256);
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  installBrandFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const innerWidth = pageWidth - margin * 2;
  let y = margin;

  // --- Header ---------------------------------------------------------------
  const logoH = 28;
  const logoW = logo ? (logo.width / logo.height) * logoH : logoH * 2.5;
  let textLeft = margin;
  if (logo) {
    try {
      doc.addImage(logo.data, "PNG", margin, y + 2, logoW, logoH);
      textLeft = margin + logoW + 12;
    } catch {
      // A missing logo must never stop the export.
    }
  }
  doc.setFont("NeueCampton", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...NAVY);
  doc.text("CDS Space", textLeft, y + 15);
  doc.setFont("NeueCampton", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text("Branding & Digital Agency", textLeft, y + 29);

  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text("EXECUTIVE BOARD", pageWidth - margin, y + 8, { align: "right" });
  doc.setFont("NeueCampton", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text(input.title, pageWidth - margin, y + 28, { align: "right" });

  y += 44;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  doc.setFont("NeueCampton", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...GREY);
  doc.text(input.subtitle, margin, y);
  doc.text(
    `Stated in ${input.currency}  ·  Exported ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE })}`,
    pageWidth - margin, y, { align: "right" },
  );
  y += 18;

  /** Starts a fresh page when the next block would not fit. */
  const ensureSpace = (needed: number) => {
    if (y + needed <= pageHeight - 46) return;
    doc.addPage();
    y = margin;
  };

  // --- Headline figures -----------------------------------------------------
  if (input.headline.length) {
    const cardW = (innerWidth - (input.headline.length - 1) * 10) / input.headline.length;
    const cardH = 52;
    ensureSpace(cardH + 12);
    input.headline.forEach((card, index) => {
      const x = margin + index * (cardW + 10);
      doc.setDrawColor(...LINE);
      doc.setFillColor(248, 250, 253);
      doc.roundedRect(x, y, cardW, cardH, 8, 8, "FD");
      doc.setFont("NeueCampton", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GREY);
      doc.text(card.label.toUpperCase(), x + 12, y + 16);
      doc.setFont("NeueCampton", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...NAVY);
      doc.text(doc.splitTextToSize(card.value, cardW - 24)[0] || "-", x + 12, y + 34);
      if (card.hint) {
        doc.setFont("NeueCampton", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...GREY);
        doc.text(doc.splitTextToSize(card.hint, cardW - 24)[0] || "", x + 12, y + 45);
      }
    });
    y += cardH + 22;
  }

  // --- Sections -------------------------------------------------------------
  for (const section of input.sections) {
    ensureSpace(60);
    doc.setFont("NeueCampton", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BLUE);
    doc.text(section.title, margin, y);
    y += 14;

    if (!section.rows.length) {
      doc.setFont("NeueCampton", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...GREY);
      doc.text(section.empty, margin, y + 8);
      y += 28;
      continue;
    }

    // Column widths are weights resolved against the page.
    const totalWeight = section.columns.reduce((sum, column) => sum + column.width, 0);
    const widths = section.columns.map((column) => (column.width / totalWeight) * innerWidth);
    const xs = widths.map((_, index) => margin + widths.slice(0, index).reduce((sum, width) => sum + width, 0));

    const drawHead = () => {
      doc.setFillColor(...NAVY);
      doc.rect(margin, y, innerWidth, 20, "F");
      doc.setFont("NeueCampton", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      section.columns.forEach((column, index) => {
        const right = column.align === "right";
        doc.text(
          column.header.toUpperCase(),
          right ? xs[index] + widths[index] - 8 : xs[index] + 8,
          y + 13,
          right ? { align: "right" } : undefined,
        );
      });
      y += 20;
    };
    drawHead();

    section.rows.forEach((row, rowIndex) => {
      // Every cell is wrapped first so the row is as tall as its tallest cell.
      const cells = row.map((value, index) => doc.splitTextToSize(String(value ?? "-"), widths[index] - 16));
      const rowH = Math.max(20, cells.reduce((tallest, lines) => Math.max(tallest, lines.length), 1) * 11 + 9);
      if (y + rowH > pageHeight - 46) {
        doc.addPage();
        y = margin;
        drawHead();
      }
      if (rowIndex % 2 === 1) {
        doc.setFillColor(248, 250, 253);
        doc.rect(margin, y, innerWidth, rowH, "F");
      }
      doc.setFont("NeueCampton", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(55, 65, 81);
      section.columns.forEach((column, index) => {
        const right = column.align === "right";
        doc.text(
          cells[index],
          right ? xs[index] + widths[index] - 8 : xs[index] + 8,
          y + 13,
          right ? { align: "right" } : undefined,
        );
      });
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.3);
      doc.line(margin, y + rowH, pageWidth - margin, y + rowH);
      y += rowH;
    });
    y += 22;
  }

  // --- Footer on every page -------------------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("NeueCampton", "italic");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text("Truly Best attracts Best - CDS Space", pageWidth / 2, pageHeight - 24, { align: "center" });
    doc.setFont("NeueCampton", "normal");
    doc.text("cdsspace.pro", margin, pageHeight - 24);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 24, { align: "right" });
    doc.setFontSize(7);
    doc.text("Confidential - internal board document", pageWidth / 2, pageHeight - 13, { align: "center" });
  }

  return doc.output("arraybuffer");
}

/* ------------------------------------------------------------------ */
/*  Per-view builders (verbatim from src/lib/executive-board-pdf.ts)   */
/* ------------------------------------------------------------------ */

/** Restates a figure entered in one currency into the board's view currency. */
function into(amount: number, from: string, view: BoardViewCurrency) {
  return convertMoney(Number(amount || 0), from || "USD", view) ?? Number(amount || 0);
}

/**
 * Money as the PDF can actually draw it.
 *
 * The brand font has no currency glyphs, so figures fall back to Helvetica,
 * whose WinAnsi encoding covers $ £ € ¥ but not ₦. One unencodable character
 * makes jsPDF emit the whole string as spaced-out UTF-16, which printed Naira
 * targets as "¦ 2 5 0 , 0 0 0". Currencies without a drawable symbol are
 * written as their code instead ("NGN 250,000"), and Intl's narrow and
 * non-breaking spaces are normalised to a plain space for the same reason.
 */
const PDF_SAFE_SYMBOLS = new Set(["$", "£", "€", "¥"]);

function pdfMoney(amount: number, currency: string) {
  const code = (currency || "USD").toUpperCase();
  const value = Number(amount || 0);
  // Whole amounts stay whole; anything with pence shows both digits (99.50, not 99.5).
  const fraction = value % 1 === 0 ? 0 : 2;
  const digits = value.toLocaleString("en-US", { minimumFractionDigits: fraction, maximumFractionDigits: fraction });
  const symbol = new Intl.NumberFormat("en-US", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
    .formatToParts(0).find((part) => part.type === "currency")?.value || "";
  const sign = value < 0 ? "-" : "";
  const magnitude = digits.replace(/^-/, "");
  return PDF_SAFE_SYMBOLS.has(symbol) ? `${sign}${symbol}${magnitude}` : `${sign}${code} ${magnitude}`;
}

function money(amount: number, view: BoardViewCurrency) {
  return pdfMoney(amount, view);
}

export function budgetsPdf(allBudgets: Budget[], view: BoardViewCurrency, period?: BudgetPeriod) {
  const budgets = period ? budgetsInPeriod(allBudgets, period) : allBudgets;
  const planned = budgets.reduce((sum, budget) => sum + into(budget.planned_amount, budget.currency, view), 0);
  const actual = budgets.reduce((sum, budget) => sum + into(budget.actual_amount, budget.currency, view), 0);
  const annual = period?.month === "annual" ? budgetYearRollup(allBudgets, period.year, view) : null;
  const rollupSections: Section[] = annual ? [
    {
      title: "Month by month",
      empty: "No months have been budgeted.",
      columns: [
        { header: "Month", width: 28 },
        { header: "Lines", width: 12, align: "right" as const },
        { header: "Planned", width: 20, align: "right" as const },
        { header: "Actual", width: 20, align: "right" as const },
        { header: "Variance", width: 20, align: "right" as const },
      ],
      rows: annual.months.map((month) => [
        month.name, String(month.lines), money(month.planned, view), money(month.actual, view), money(month.planned - month.actual, view),
      ]),
    },
    {
      title: "By category",
      empty: "No categories yet.",
      columns: [
        { header: "Category", width: 28 },
        { header: "Lines", width: 12, align: "right" as const },
        { header: "Planned", width: 20, align: "right" as const },
        { header: "Actual", width: 20, align: "right" as const },
        { header: "Variance", width: 20, align: "right" as const },
      ],
      rows: annual.categories.map((category) => [
        category.category, String(category.lines), money(category.planned, view), money(category.actual, view), money(category.planned - category.actual, view),
      ]),
    },
  ] : [];
  const periodName = !period ? "" : period.month === "annual" ? `${period.year}` : `${BUDGET_MONTH_NAMES[period.month - 1]} ${period.year}`;
  return {
    view: "budgets",
    title: !period ? "Budgets" : period.month === "annual" ? `Annual operations budget ${periodName}` : `Budget for ${periodName}`,
    subtitle: "What we planned to spend, what we have spent, and where the gap is.",
    currency: view,
    headline: [
      { label: "Budget lines", value: String(budgets.length) },
      { label: "Planned", value: money(planned, view) },
      { label: "Actual", value: money(actual, view) },
      { label: "Variance", value: money(planned - actual, view), hint: planned - actual < 0 ? "Over plan" : "Under plan" },
    ],
    sections: [...rollupSections, {
      title: period ? `Budget lines, ${periodName}` : "All budget lines",
      empty: "No budgets have been set.",
      columns: [
        { header: "Title", width: 22 },
        { header: "Category", width: 10 },
        { header: "Period", width: 12 },
        { header: "Owner", width: 11 },
        { header: "Status", width: 8 },
        { header: "Planned", width: 12, align: "right" as const },
        { header: "Actual", width: 12, align: "right" as const },
        { header: "Variance", width: 13, align: "right" as const },
      ],
      rows: budgets.map((budget) => [
        budget.title,
        budget.category,
        budget.period_label || `${fmtDate(budget.period_start)} to ${fmtDate(budget.period_end)}`,
        budget.owner || "-",
        STATUS_LABELS[budget.status] || budget.status,
        money(into(budget.planned_amount, budget.currency, view), view),
        money(into(budget.actual_amount, budget.currency, view), view),
        money(into(budgetVariance(budget), budget.currency, view), view),
      ]),
    }],
  };
}

export function expansionBudgetsPdf(budgets: ExpansionBudget[], view: BoardViewCurrency) {
  const pipeline = budgets.filter((budget) => budget.status !== "launched" && budget.status !== "cancelled");
  const forecast = pipeline.reduce((sum, budget) => sum + into(expansionRequirement(budget), budget.currency, view), 0);
  const committed = pipeline.reduce((sum, budget) => sum + into(budget.committed_amount, budget.currency, view), 0);
  const gap = pipeline.reduce((sum, budget) => sum + into(expansionFundingGap(budget), budget.currency, view), 0);
  return {
    view: "expansion-budgets",
    title: "Expansion budgets",
    subtitle: "Future company investments, funding readiness, and target launch dates.",
    currency: view,
    headline: [
      { label: "Future plans", value: String(pipeline.length) },
      { label: "Forecast requirement", value: money(forecast, view) },
      { label: "Committed funding", value: money(committed, view) },
      { label: "Funding gap", value: money(gap, view) },
    ],
    sections: [{
      title: "Expansion pipeline",
      empty: "No expansion budgets have been recorded.",
      columns: [
        { header: "Plan", width: 20 },
        { header: "Type / market", width: 16 },
        { header: "Target", width: 11 },
        { header: "Stage", width: 9 },
        { header: "Priority", width: 8 },
        { header: "Requirement", width: 12, align: "right" as const },
        { header: "Committed", width: 12, align: "right" as const },
        { header: "Gap", width: 12, align: "right" as const },
      ],
      rows: budgets.map((budget) => [
        budget.title,
        [EXPANSION_TYPE_LABELS[budget.expansion_type], budget.location].filter(Boolean).join(" · "),
        fmtDate(budget.target_start),
        STATUS_LABELS[budget.status] || budget.status,
        STATUS_LABELS[budget.priority] || budget.priority,
        money(into(expansionRequirement(budget), budget.currency, view), view),
        money(into(budget.committed_amount, budget.currency, view), view),
        money(into(expansionFundingGap(budget), budget.currency, view), view),
      ]),
    }],
  };
}

export function targetsPdf(targets: Target[], view: BoardViewCurrency) {
  const achieved = targets.filter((target) => target.status === "achieved").length;
  const atRisk = targets.filter((target) => target.status === "at_risk" || target.status === "off_track").length;
  return {
    view: "targets",
    title: "Targets",
    subtitle: "The numbers we are holding ourselves to, and where each one stands.",
    currency: view,
    headline: [
      { label: "Targets", value: String(targets.length) },
      { label: "Achieved", value: String(achieved) },
      { label: "At risk or off track", value: String(atRisk) },
      { label: "On track", value: String(targets.filter((target) => target.status === "on_track").length) },
    ],
    sections: [{
      title: "All targets",
      empty: "No targets set yet.",
      columns: [
        { header: "Title", width: 22 },
        { header: "Metric", width: 14 },
        { header: "Owner", width: 11 },
        { header: "Due", width: 10 },
        { header: "Status", width: 9 },
        { header: "Current", width: 12, align: "right" as const },
        { header: "Target", width: 12, align: "right" as const },
        { header: "Progress", width: 10, align: "right" as const },
      ],
      rows: targets.map((target) => {
        // A target measured in a currency is restated like any other figure; one
        // measured in leads or percent is left exactly as it was entered.
        const unit = currencyUnit(target.unit);
        const show = (value: number) => unit ? money(into(value, unit, view), view) : `${Number(value || 0).toLocaleString()}${target.unit ? ` ${target.unit}` : ""}`;
        return [
          target.title,
          target.metric || "-",
          target.owner || "-",
          fmtDate(target.due_on),
          STATUS_LABELS[target.status] || target.status,
          show(target.current_value),
          show(target.target_value),
          `${targetProgress(target)}%`,
        ];
      }),
    }],
  };
}

export function modelsPdf(models: RevenueModel[], view: BoardViewCurrency) {
  const monthly = models.reduce((sum, model) => sum + into(model.target_monthly_value, model.currency, view), 0);
  const annual = models.reduce((sum, model) => sum + into(model.target_annual_value, model.currency, view), 0);
  return {
    view: "revenue-models",
    title: "Revenue models",
    subtitle: "How the business is meant to earn, and how far each plan has been executed.",
    currency: view,
    headline: [
      { label: "Models", value: String(models.length) },
      { label: "Active", value: String(models.filter((model) => model.status === "active").length) },
      { label: "Monthly target", value: money(monthly, view) },
      { label: "Annual target", value: money(annual, view) },
    ],
    sections: [
      {
        title: "Models",
        empty: "No revenue models recorded.",
        columns: [
          { header: "Name", width: 20 },
          { header: "Pricing basis", width: 18 },
          { header: "Owner", width: 12 },
          { header: "Status", width: 10 },
          { header: "Monthly", width: 13, align: "right" as const },
          { header: "Annual", width: 13, align: "right" as const },
          { header: "Plan done", width: 14, align: "right" as const },
        ],
        rows: models.map((model) => [
          model.name,
          model.pricing_basis || "-",
          model.owner || "-",
          STATUS_LABELS[model.status] || model.status,
          money(into(model.target_monthly_value, model.currency, view), view),
          money(into(model.target_annual_value, model.currency, view), view),
          `${planProgress(model.steps || [])}% of ${(model.steps || []).length} steps`,
        ]),
      },
      // The execution plan is the substance of a revenue model, so it is
      // exported rather than summarised away into a percentage.
      ...models.filter((model) => (model.steps || []).length).map((model) => ({
        title: `Execution plan: ${model.name}`,
        empty: "No steps recorded.",
        columns: [
          { header: "#", width: 4, align: "right" as const },
          { header: "Step", width: 26 },
          { header: "Detail", width: 38 },
          { header: "Owner", width: 14 },
          { header: "Due", width: 10 },
          { header: "Status", width: 8 },
        ],
        rows: (model.steps || []).map((step, index) => [
          String(index + 1),
          step.title,
          step.detail || "-",
          step.owner || "-",
          fmtDate(step.due_on),
          STATUS_LABELS[step.status] || step.status,
        ]),
      })),
    ],
  };
}

export function vaultPdf(files: VaultFile[], folders: VaultFolder[], view: BoardViewCurrency) {
  const folderName = (id: string | null) => folders.find((folder) => folder.id === id)?.name || "Vault root";
  return {
    view: "vault",
    title: "Vault",
    subtitle: "An index of the board's documents. File contents are not included in this export.",
    currency: view,
    headline: [
      { label: "Files", value: String(files.length) },
      { label: "Folders", value: String(folders.length) },
      { label: "Password protected", value: String(files.filter((file) => file.has_password || file.inherits_password).length) },
      { label: "Total size", value: formatBytes(files.reduce((sum, file) => sum + Number(file.file_size_bytes || 0), 0)) },
    ],
    sections: [{
      title: "Documents",
      empty: "The vault is empty.",
      columns: [
        { header: "Title", width: 24 },
        { header: "Folder", width: 14 },
        { header: "Kind", width: 12 },
        { header: "File", width: 20 },
        { header: "Protected", width: 10 },
        { header: "Size", width: 10, align: "right" as const },
        { header: "Added", width: 10, align: "right" as const },
      ],
      rows: files.map((file) => [
        file.title,
        folderName(file.folder_id),
        KIND_LABELS[file.kind] || file.kind,
        file.file_name || file.link_url || "-",
        file.has_password ? "Yes" : file.inherits_password ? "By folder" : "No",
        formatBytes(Number(file.file_size_bytes || 0)),
        fmtDate(file.created_at),
      ]),
    }],
  };
}

/** The overview is every view at a glance, in one document. */
export function overviewPdf(input: {
  budgets: Budget[]; expansionBudgets: ExpansionBudget[]; targets: Target[]; models: RevenueModel[]; files: VaultFile[]; folders: VaultFolder[];
}, view: BoardViewCurrency) {
  const planned = input.budgets.reduce((sum, budget) => sum + into(budget.planned_amount, budget.currency, view), 0);
  const actual = input.budgets.reduce((sum, budget) => sum + into(budget.actual_amount, budget.currency, view), 0);
  const monthly = input.models.reduce((sum, model) => sum + into(model.target_monthly_value, model.currency, view), 0);
  const expansionForecast = input.expansionBudgets
    .filter((budget) => budget.status !== "launched" && budget.status !== "cancelled")
    .reduce((sum, budget) => sum + into(expansionRequirement(budget), budget.currency, view), 0);
  return {
    view: "overview",
    title: "Board overview",
    subtitle: "Budgets, future expansion plans, targets, revenue models and the vault, as one document.",
    currency: view,
    headline: [
      { label: "Planned spend", value: money(planned, view) },
      { label: "Actual spend", value: money(actual, view), hint: `${money(planned - actual, view)} variance` },
      { label: "Expansion forecast", value: money(expansionForecast, view), hint: `${input.expansionBudgets.length} plans` },
      { label: "Monthly revenue target", value: money(monthly, view) },
      { label: "Targets", value: String(input.targets.length), hint: `${input.targets.filter((target) => target.status === "achieved").length} achieved` },
      { label: "Vault documents", value: String(input.files.length) },
    ],
    sections: [
      ...budgetsPdf(input.budgets, view).sections,
      ...expansionBudgetsPdf(input.expansionBudgets, view).sections,
      ...targetsPdf(input.targets, view).sections,
      ...modelsPdf(input.models, view).sections.slice(0, 1),
      ...vaultPdf(input.files, input.folders, view).sections,
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  One budget on its own sheet, with its implementation plan          */
/* ------------------------------------------------------------------ */

/**
 * A file name that survives a title with slashes, quotes or spaces in it.
 * "Brand Identity Guidelines/Infrastructure" must not become a directory.
 */
function sheetFileName(kind: string, title: string) {
  const safe = String(title || "untitled")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
  return `CDS-Space-${kind}-${safe}-${new Date().toISOString().slice(0, 10)}.pdf`;
}

/** A two-column detail table. Rows with nothing recorded are dropped. */
function detailSection(title: string, rows: Array<[string, string | null | undefined]>): Section {
  return {
    title,
    empty: "Nothing recorded.",
    columns: [{ header: "Field", width: 26 }, { header: "Detail", width: 74 }],
    rows: rows.flatMap(([label, value]) => {
      const text = String(value ?? "").trim();
      return text && text !== "-" ? [[label, text]] : [];
    }),
  };
}

/** Ordered plan phases. `at` marks how far the record says the work has got. */
type Phase = { name: string; covers: string; state: string };

function phaseSection(phases: Phase[]): Section {
  return {
    title: "Implementation plan",
    empty: "No plan could be built from what is recorded against this budget.",
    columns: [
      { header: "#", width: 5 },
      { header: "Phase", width: 20 },
      { header: "What it covers", width: 55 },
      { header: "Where it stands", width: 20 },
    ],
    rows: phases.map((phase, index) => [String(index + 1), phase.name, phase.covers, phase.state]),
  };
}

/**
 * One operating budget as its own document.
 *
 * The plan is the lifecycle every budget line goes through, filled in with what
 * this record actually holds: the figures entered, the period it covers, and
 * how far its own status says it has got. Nothing is inferred beyond that, so a
 * phase with nothing recorded against it says so rather than inventing a step.
 */
export function budgetPdf(budget: Budget, view: BoardViewCurrency) {
  const planned = into(budget.planned_amount, budget.currency, view);
  const actual = into(budget.actual_amount, budget.currency, view);
  const variance = planned - actual;
  const spent = planned > 0 ? Math.round((actual / planned) * 100) : 0;
  const period = budget.period_label || `${fmtDate(budget.period_start)} to ${fmtDate(budget.period_end)}`;
  const reached = (stages: string[]) => stages.includes(budget.status);

  const phases: Phase[] = [
    {
      name: "Agree the line",
      covers: `${budget.title} set aside ${money(planned, view)} under ${budget.category}${budget.owner ? `, owned by ${budget.owner}` : ""}.`,
      state: reached(["active", "closed"]) ? "Done" : "In draft",
    },
    {
      name: "Open for spend",
      covers: `Commitments run across ${period}. Amounts were entered in ${budget.currency}${budget.currency !== view ? ` and are restated here in ${view}` : ""}.`,
      state: budget.status === "active" ? "Open now" : reached(["closed"]) ? "Closed" : "Not yet opened",
    },
    {
      name: "Track against plan",
      covers: `${money(actual, view)} recorded so far, ${spent}% of the ${money(planned, view)} planned.`,
      state: actual > 0 ? `${spent}% drawn` : "Nothing drawn yet",
    },
    {
      name: "Close and report",
      covers: variance < 0
        ? `Currently ${money(Math.abs(variance), view)} over plan, which has to be explained or funded before close.`
        : `Currently ${money(variance, view)} under plan, available to release or carry.`,
      state: budget.status === "closed" ? "Closed" : "Outstanding",
    },
  ];

  return {
    view: "budget",
    title: budget.title,
    subtitle: `Budget line and implementation plan · ${period}`,
    currency: view,
    fileName: sheetFileName("Budget", budget.title),
    headline: [
      { label: "Planned", value: money(planned, view) },
      { label: "Actual", value: money(actual, view) },
      { label: "Variance", value: money(variance, view), hint: variance < 0 ? "Over plan" : "Under plan" },
      { label: "Status", value: STATUS_LABELS[budget.status] || budget.status, hint: `${spent}% drawn` },
    ],
    sections: [
      detailSection("Budget detail", [
        ["Category", budget.category],
        ["Period", period],
        ["Owner", budget.owner],
        ["Status", STATUS_LABELS[budget.status] || budget.status],
        ["Entered in", `${pdfMoney(budget.planned_amount, budget.currency)} planned, ${pdfMoney(budget.actual_amount, budget.currency)} actual`],
        ["Created", fmtDate(budget.created_at)],
        ["Last updated", fmtDate(budget.updated_at)],
      ]),
      phaseSection(phases),
      detailSection("Notes", [["Notes", budget.notes]]),
    ],
  };
}

/**
 * One expansion plan as its own document.
 *
 * An expansion budget already is a plan, so the phases follow the stage
 * pipeline the board tracks it through, each annotated with what the record
 * holds against it: the rationale, the money, the funding gap, the dates, and
 * the outcome being aimed at.
 */
export function expansionBudgetPdf(budget: ExpansionBudget, view: BoardViewCurrency) {
  const requirement = into(expansionRequirement(budget), budget.currency, view);
  const committed = into(budget.committed_amount, budget.currency, view);
  const gap = into(expansionFundingGap(budget), budget.currency, view);
  const funded = requirement > 0 ? Math.round((committed / requirement) * 100) : 0;
  const order = ["idea", "researching", "planned", "approved", "launched"];
  const position = order.indexOf(budget.status);
  // A stage is behind us, the one we are in, or still ahead. On hold and
  // cancelled sit outside the pipeline, so they are stated rather than placed.
  const stageState = (stage: string) => {
    if (budget.status === "cancelled") return "Cancelled";
    if (budget.status === "on_hold") return "On hold";
    const index = order.indexOf(stage);
    if (position < 0) return "Not started";
    if (index < position) return "Done";
    if (index === position) return "Here now";
    return "Ahead";
  };

  const phases: Phase[] = [
    {
      name: "Idea",
      covers: budget.rationale?.trim() || "No rationale has been written for this plan yet.",
      state: stageState("idea"),
    },
    {
      name: "Research",
      covers: `${EXPANSION_TYPE_LABELS[budget.expansion_type]}${budget.location ? ` in ${budget.location}` : ""}. Sizing came out at ${money(into(budget.estimated_amount, budget.currency, view), view)} plus ${money(into(budget.contingency_amount, budget.currency, view), view)} contingency.`,
      state: stageState("researching"),
    },
    {
      name: "Plan and fund",
      covers: gap > 0
        ? `${money(committed, view)} of ${money(requirement, view)} committed (${funded}%). ${money(gap, view)} still to be found${budget.funding_source ? `, against ${budget.funding_source}` : ", with no funding source named"}.`
        : `Fully funded at ${money(committed, view)}${budget.funding_source ? ` from ${budget.funding_source}` : ""}.`,
      state: stageState("planned"),
    },
    {
      name: "Approve",
      covers: `Priority ${STATUS_LABELS[budget.priority] || budget.priority}${budget.owner ? `, owned by ${budget.owner}` : ", with no owner named"}. Target start ${fmtDate(budget.target_start)}${budget.target_end ? `, target finish ${fmtDate(budget.target_end)}` : ""}.`,
      state: stageState("approved"),
    },
    {
      name: "Launch",
      covers: budget.expected_outcome?.trim() || "No expected outcome has been written for this plan yet.",
      state: stageState("launched"),
    },
  ];

  return {
    view: "expansion-budget",
    title: budget.title,
    subtitle: `Expansion plan · ${EXPANSION_TYPE_LABELS[budget.expansion_type]}${budget.location ? ` · ${budget.location}` : ""}`,
    currency: view,
    fileName: sheetFileName("Expansion-Plan", budget.title),
    headline: [
      { label: "Requirement", value: money(requirement, view), hint: "Estimate plus contingency" },
      { label: "Committed", value: money(committed, view), hint: `${funded}% funded` },
      { label: "Funding gap", value: money(gap, view) },
      { label: "Stage", value: STATUS_LABELS[budget.status] || budget.status, hint: `Priority ${STATUS_LABELS[budget.priority] || budget.priority}` },
    ],
    sections: [
      detailSection("Plan detail", [
        ["Type", EXPANSION_TYPE_LABELS[budget.expansion_type]],
        ["Market or location", budget.location],
        ["Owner", budget.owner],
        ["Stage", STATUS_LABELS[budget.status] || budget.status],
        ["Priority", STATUS_LABELS[budget.priority] || budget.priority],
        ["Target start", fmtDate(budget.target_start)],
        ["Target finish", budget.target_end ? fmtDate(budget.target_end) : ""],
        ["Funding source", budget.funding_source],
        ["Entered in", `${pdfMoney(expansionRequirement(budget), budget.currency)} required`],
        ["Created", fmtDate(budget.created_at)],
        ["Last updated", fmtDate(budget.updated_at)],
      ]),
      phaseSection(phases),
      detailSection("Rationale, outcome and notes", [
        ["Why we are doing it", budget.rationale],
        ["What success looks like", budget.expected_outcome],
        ["Notes", budget.notes],
      ]),
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Data + request handling for the mobile PDF route                   */
/* ------------------------------------------------------------------ */

export type BoardPdfView =
  | "overview" | "budgets" | "expansion-budgets" | "targets" | "models" | "vault" | "budget" | "expansion-budget";

const BOARD_PDF_VIEWS: BoardPdfView[] = ["overview", "budgets", "expansion-budgets", "targets", "models", "vault", "budget", "expansion-budget"];

/** Same permission keys as GET /api/admin/executive-board for the view the PDF is of. */
export const BOARD_PDF_PERMISSION: Record<BoardPdfView, string> = {
  overview: "executive_board.view",
  budgets: "executive_board.budgets_view",
  budget: "executive_board.budgets_view",
  "expansion-budgets": "executive_board.expansion_budgets_view",
  "expansion-budget": "executive_board.expansion_budgets_view",
  targets: "executive_board.targets_view",
  models: "executive_board.models_view",
  vault: "executive_board.vault_view",
};

export function boardPdfView(value: string | null): BoardPdfView {
  // The app (and older links) may say "revenue-models" or "expansion" for these views.
  const aliases: Record<string, BoardPdfView> = { "revenue-models": "models", expansion: "expansion-budgets" };
  const key = String(value || "").trim();
  const resolved = aliases[key] || key;
  return (BOARD_PDF_VIEWS as string[]).includes(resolved) ? (resolved as BoardPdfView) : "overview";
}

export function boardPdfCurrency(value: string | null): BoardViewCurrency {
  const code = String(value || "").trim().toUpperCase();
  return ((BOARD_VIEW_CURRENCIES as readonly string[]).includes(code) ? code : "USD") as BoardViewCurrency;
}

/** ?year=2026&month=3 (or month=annual). Without a valid year the whole list is exported, like budgetsPdf(list, view). */
export function boardPdfPeriod(year: string | null, month: string | null): BudgetPeriod | undefined {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return undefined;
  if (month === "annual") return { year: y, month: "annual" };
  const m = Number(month);
  if (!Number.isInteger(m) || m < 1 || m > 12) return undefined;
  return { year: y, month: m };
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

// Postgres numerics arrive as strings and dates as Date objects; the builders
// expect the JSON shape the web page receives from the board route.
const plain = <T>(rows: any[]): T[] => JSON.parse(JSON.stringify(rows)) as T[];

/** The slices the web page has for `view` (the queries of loadBoard in the board route). */
async function loadBoardSlices(view: "overview" | "budgets" | "expansion-budgets" | "targets" | "models" | "vault") {
  const overview = view === "overview";
  const none = Promise.resolve([] as any[]);
  const [budgets, expansionBudgets, models, steps, targets, folders, files] = await Promise.all([
    overview || view === "budgets"
      ? glashQuery<any>(`select * from public.executive_budgets order by budget_year desc, budget_month desc, created_at desc limit 2000`)
      : none,
    overview || view === "expansion-budgets"
      ? glashQuery<any>(`select * from public.executive_expansion_budgets order by target_start asc, created_at desc limit 500`)
      : none,
    overview || view === "models"
      ? glashQuery<any>(`select * from public.executive_revenue_models order by position asc, created_at asc limit 200`)
      : none,
    overview || view === "models"
      ? glashQuery<any>(`select * from public.executive_revenue_steps order by position asc, created_at asc limit 2000`)
      : none,
    overview || view === "targets"
      ? glashQuery<any>(`select * from public.executive_targets order by due_on asc nulls last, created_at desc limit 500`)
      : none,
    overview || view === "vault"
      ? glashQuery<any>(`select id, parent_id, name, description, password_hash, created_at from public.executive_vault_folders order by name asc limit 500`)
      : none,
    overview || view === "vault"
      ? glashQuery<any>(`select id, folder_id, title, description, kind, file_name, file_mime, file_size_bytes, password_hash, created_at, source_kind, source_id, link_url from public.executive_vault_files order by created_at desc limit 1000`)
      : none,
  ]);

  const folderHasPassword = new Map<string, boolean>();
  folders.forEach((folder: any) => folderHasPassword.set(folder.id, !!folder.password_hash));

  return {
    budgets: plain<Budget>(budgets),
    expansionBudgets: plain<ExpansionBudget>(expansionBudgets),
    targets: plain<Target>(targets),
    models: plain<RevenueModel>(models.map((model: any) => ({ ...model, steps: steps.filter((step: any) => step.model_id === model.id) }))),
    folders: plain<VaultFolder>(folders.map(({ password_hash, ...folder }: any) => ({ ...folder, has_password: !!password_hash }))),
    files: plain<VaultFile>(files.map(({ password_hash, ...file }: any) => ({
      ...file,
      has_password: !!password_hash,
      inherits_password: !password_hash && !!file.folder_id && !!folderHasPassword.get(file.folder_id),
    }))),
  };
}

/** Numbers stored as numeric come back from pg as strings; the builders add them up. */
function numeric<T extends Record<string, any>>(row: T, keys: string[]): T {
  const next: Record<string, any> = { ...row };
  keys.forEach((key) => { if (next[key] != null) next[key] = Number(next[key]); });
  return next as T;
}

const BUDGET_NUMBERS = ["planned_amount", "actual_amount", "budget_year", "budget_month"];
const EXPANSION_NUMBERS = ["estimated_amount", "contingency_amount", "committed_amount"];
const TARGET_NUMBERS = ["target_value", "current_value"];
const MODEL_NUMBERS = ["target_monthly_value", "target_annual_value", "position"];

/**
 * Builds the PDF the web's "Export PDF" (or a row's download button) makes for
 * `view`. Returns null when a single record was asked for and does not exist.
 */
export async function buildBoardPdf(opts: {
  view: BoardPdfView;
  currency: BoardViewCurrency;
  period?: BudgetPeriod;
  id?: string;
}): Promise<{ pdf: ArrayBuffer; fileName: string } | null> {
  const { view, currency } = opts;
  let input: BoardPdfInput;

  if (view === "budget" || view === "expansion-budget") {
    const id = String(opts.id || "");
    if (!isUuid(id)) return null;
    const table = view === "budget" ? "executive_budgets" : "executive_expansion_budgets";
    const row = await glashMaybeOne<any>(`select * from public.${table} where id=$1`, [id]);
    if (!row) return null;
    const [record] = plain<any>([row]);
    input = view === "budget"
      ? budgetPdf(numeric<Budget>(record, BUDGET_NUMBERS), currency)
      : expansionBudgetPdf(numeric<ExpansionBudget>(record, EXPANSION_NUMBERS), currency);
  } else {
    const board = await loadBoardSlices(view);
    const budgets = board.budgets.map((b) => numeric(b, BUDGET_NUMBERS));
    const expansionBudgets = board.expansionBudgets.map((b) => numeric(b, EXPANSION_NUMBERS));
    const targets = board.targets.map((t) => numeric(t, TARGET_NUMBERS));
    const models = board.models.map((m) => numeric(m, MODEL_NUMBERS));
    const files = board.files.map((f) => numeric(f, ["file_size_bytes"]));
    input = view === "budgets" ? budgetsPdf(budgets, currency, opts.period)
      : view === "expansion-budgets" ? expansionBudgetsPdf(expansionBudgets, currency)
        : view === "targets" ? targetsPdf(targets, currency)
          : view === "models" ? modelsPdf(models, currency)
            : view === "vault" ? vaultPdf(files, board.folders, currency)
              : overviewPdf({ budgets, expansionBudgets, targets, models, files, folders: board.folders }, currency);
  }

  return { pdf: await renderBoardPdf(input), fileName: boardPdfFileName(input) };
}

/** A vault entry that points at a cDoc: the cDoc's id, or null when the entry is something else. */
export async function vaultCDocSourceId(fileId: string): Promise<string | null> {
  if (!isUuid(fileId)) return null;
  const row = await glashMaybeOne<any>(
    `select f.source_kind, f.source_id
       from public.executive_vault_files f
       join public.team_cdocs d on d.id::text = f.source_id::text and d.is_archived is not true
      where f.id=$1`,
    [fileId],
  );
  // Archived cDocs count as gone, as in the web vault's resolveSource.
  return row && row.source_kind === "cdoc" && row.source_id ? String(row.source_id) : null;
}
