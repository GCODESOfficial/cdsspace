"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Landmark,
  LineChart,
  Loader2,
  PieChart as PieChartIcon,
  Receipt,
  Scale,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { appConfirm } from "@/lib/app-notify";
import { useFinanceDisplayCurrency } from "@/components/finance/FinanceCurrencySelector";
import { convertFinanceAmount } from "@/lib/finance/currency-display";
import { formatMoney, type Currency } from "@/lib/finance/types";

type ReportKey = "pl" | "balance" | "ledger";
type ChartKey = "trend" | "mix" | "tax";
type QuickPeriod = "year" | "q1" | "q2" | "q3" | "q4" | "custom";
type ExportFormat = "csv" | "pdf" | "xls";

interface BankStatement {
  id: string;
  filename: string;
  storage_path?: string | null;
  bank_name: string | null;
  account_number: string | null;
  period_start: string | null;
  period_end: string | null;
  total_credit: number;
  total_debit: number;
  uploaded_at: string;
  currency: string;
  processing_status: string;
  row_count: number;
  matched_count: number;
  unmatched_count: number;
  other_inflow_count: number;
  review_count: number;
  duplicate_count: number;
  processing_error?: string | null;
  account_name?: string | null;
}

interface BankAccountOption {
  id: string;
  currency: string;
  bank_name: string;
  account_name: string;
  account_number: string | null;
  iban: string | null;
}

interface BankTransaction {
  id: string;
  txn_date: string;
  description: string;
  transaction_reference: string | null;
  amount: number;
  txn_type: "credit" | "debit";
  balance: number | null;
  category: string | null;
  match_status: string;
  match_confidence: number | null;
  match_reason: string | null;
  invoice_number?: string | null;
  client_name?: string | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  client_name: string;
  total: number;
  currency: Currency;
  amount_paid: number | null;
  balance_due: number | null;
  payment_percentage: number | null;
  subtotal: number | null;
  tax_amount: number | null;
  tax_rate: number | null;
  status: string;
  issue_date: string;
  due_date: string | null;
}

interface ExpenditureRow {
  id: string;
  title: string;
  category: string | null;
  amount: number;
  currency: Currency;
  spent_on: string;
}

interface InflowRow {
  id: string;
  title: string;
  source: string | null;
  amount: number;
  currency: string;
  received_on: string;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
}

interface InvoicePaymentRow {
  id: string;
  invoice_id: string;
  amount: number;
  currency: string;
  paid_on: string;
  finance_invoices: {
    invoice_number: string;
    client_name: string;
    total: number;
    subtotal: number | null;
    tax_amount: number | null;
  } | null;
}

interface ContractorPaymentRow {
  id: string;
  amount: number;
  currency: Currency;
  paid_on: string;
}

interface PayrollRunRow {
  id: string;
  title: string;
  period: string;
  status: string;
  total: number;
  currency: Currency;
  created_at: string;
}

interface EmployeeRow {
  id: string;
  base_salary: number | null;
  currency: Currency;
}

interface ChartPoint {
  label: string;
  revenue: number;
  expenses: number;
  net: number;
  operations: number;
  contractors: number;
  payroll: number;
}

interface BreakdownPoint {
  name: string;
  value: number;
  color: string;
}

interface LedgerRow {
  date: string;
  account: string;
  memo: string;
  debit: number;
  credit: number;
}

interface FinancialReport {
  totalRevenue: number;
  totalInflow: number;
  totalExpenses: number;
  netProfit: number;
  outstandingReceivables: number;
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
  operationsSpend: number;
  contractorPay: number;
  payroll: number;
  taxableRevenue: number;
  invoiceTax: number;
  chartData: ChartPoint[];
  expenseBreakdown: BreakdownPoint[];
  ledgerRows: LedgerRow[];
  invoices: InvoiceRow[];
  inflows: InflowRow[];
  expenditures: ExpenditureRow[];
  contractorPayments: ContractorPaymentRow[];
  payrollRuns: PayrollRunRow[];
}

interface TaxDetails {
  tin: string;
  taxOffice: string;
  filingDate: string;
  filingStatus: "not_started" | "preparing" | "filed" | "remitted";
  firsReference: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const VAT_RATE = 0.075;
const TAX_STORAGE_KEY = "cds-finance-tax-compliance";

const QUICK_PERIODS: { key: QuickPeriod; label: string }[] = [
  { key: "year", label: "Year" },
  { key: "q1", label: "Q1" },
  { key: "q2", label: "Q2" },
  { key: "q3", label: "Q3" },
  { key: "q4", label: "Q4" },
  { key: "custom", label: "Custom" },
];

const CHART_LABELS: Record<string, string> = {
  revenue: "Revenue",
  expenses: "Expenses",
  net: "Net",
  operations: "Operations",
  contractors: "Contractors",
  payroll: "Payroll",
  value: "Amount",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function dateString(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function periodRange(year: number, period: QuickPeriod) {
  if (period === "q1") return { start: dateString(year, 1, 1), end: dateString(year, 3, 31) };
  if (period === "q2") return { start: dateString(year, 4, 1), end: dateString(year, 6, 30) };
  if (period === "q3") return { start: dateString(year, 7, 1), end: dateString(year, 9, 30) };
  if (period === "q4") return { start: dateString(year, 10, 1), end: dateString(year, 12, 31) };
  return { start: dateString(year, 1, 1), end: dateString(year, 12, 31) };
}

function monthKey(date: string) {
  return safeDateKey(date).slice(0, 7);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function buildMonthBuckets(start: string, end: string) {
  const startYear = Number(start.slice(0, 4));
  const startMonth = Number(start.slice(5, 7)) - 1;
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7)) - 1;
  const buckets = new Map<string, ChartPoint>();
  const cursor = new Date(startYear, startMonth, 1);
  const final = new Date(endYear, endMonth, 1);

  while (cursor <= final) {
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`;
    buckets.set(key, {
      label: monthLabel(key),
      revenue: 0,
      expenses: 0,
      net: 0,
      operations: 0,
      contractors: 0,
      payroll: 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return buckets;
}

function percent(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(1)}%`;
}

function safeDateKey(value: string | null | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function safeFormatDate(value: string | null | undefined) {
  const key = safeDateKey(value);
  if (!key) return "-";
  const parsed = new Date(`${key}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
}

function sortTime(value: string) {
  const key = safeDateKey(value);
  return key ? new Date(`${key}T12:00:00`).getTime() : 0;
}

function formatCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`;
  return `₦${n.toFixed(0)}`;
}

function loadTaxDetails(): TaxDetails {
  const fallback: TaxDetails = {
    tin: "",
    taxOffice: "",
    filingDate: "",
    filingStatus: "not_started",
    firsReference: "",
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(TAX_STORAGE_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function daysUntil(date: string) {
  if (!date) return null;
  const target = new Date(`${date}T23:59:59`);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportRows(report: FinancialReport, periodLabel: string, taxDetails: TaxDetails, estimatedVat: number) {
  const rows: string[][] = [
    ["Section", "Metric", "Value", "Debit", "Credit", "Date", "Memo"],
    ["Period", "Selected period", periodLabel, "", "", "", ""],
    ["Profit & Loss", "Revenue", String(report.totalRevenue), "", "", "", ""],
    ["Profit & Loss", "Recorded inflow", String(report.totalInflow), "", String(report.totalInflow), "", ""],
    ["Profit & Loss", "Operating expenses", String(report.operationsSpend), String(report.operationsSpend), "", "", ""],
    ["Profit & Loss", "Contractor payments", String(report.contractorPay), String(report.contractorPay), "", "", ""],
    ["Profit & Loss", "Payroll", String(report.payroll), String(report.payroll), "", "", ""],
    ["Profit & Loss", "Net profit / loss", String(report.netProfit), "", "", "", ""],
    ["Balance Sheet", "Outstanding receivables", String(report.outstandingReceivables), "", "", "", ""],
    ["Balance Sheet", "Total assets", String(report.totalAssets), "", "", "", ""],
    ["Balance Sheet", "Estimated liabilities", String(report.totalLiabilities), "", "", "", ""],
    ["Balance Sheet", "Equity", String(report.equity), "", "", "", ""],
    ["Tax Compliance", "Taxable revenue", String(report.taxableRevenue), "", "", "", ""],
    ["Tax Compliance", "Invoice tax captured", String(report.invoiceTax), "", "", "", ""],
    ["Tax Compliance", "VAT estimate", String(estimatedVat), "", "", "", ""],
    ["FIRS Filing", "TIN", taxDetails.tin || "Not set", "", "", "", ""],
    ["FIRS Filing", "Tax office", taxDetails.taxOffice || "Not set", "", "", "", ""],
    ["FIRS Filing", "Target filing date", taxDetails.filingDate || "Not set", "", "", "", ""],
    ["FIRS Filing", "Status", taxDetails.filingStatus.replace("_", " "), "", "", "", ""],
    ["FIRS Filing", "Reference", taxDetails.firsReference || "Not set", "", "", "", ""],
  ];

  report.chartData.forEach((point) => {
    rows.push(["Monthly Trend", "Revenue", String(point.revenue), "", String(point.revenue), point.label, ""]);
    rows.push(["Monthly Trend", "Expenses", String(point.expenses), String(point.expenses), "", point.label, ""]);
    rows.push(["Monthly Trend", "Net", String(point.net), point.net < 0 ? String(Math.abs(point.net)) : "", point.net >= 0 ? String(point.net) : "", point.label, ""]);
  });

  report.ledgerRows.forEach((row) => {
    rows.push(["General Ledger", row.account, "", String(row.debit || ""), String(row.credit || ""), row.date, row.memo]);
  });

  return rows;
}

function downloadBlob(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function rowsToCsv(rows: string[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function rowsToXls(rows: string[][]) {
  const tableRows = rows.map((row, index) => {
    const tag = index === 0 ? "th" : "td";
    return `<tr>${row.map((cell) => `<${tag}>${String(cell).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</${tag}>`).join("")}</tr>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body><table>${tableRows}</table></body></html>`;
}

export default function FinancialAuditPage() {
  const initialRange = periodRange(CURRENT_YEAR, "year");
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isReportLoading, setIsReportLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [activeReport, setActiveReport] = useState<ReportKey>("pl");
  const [activeChart, setActiveChart] = useState<ChartKey>("trend");
  const [showUpload, setShowUpload] = useState(false);
  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>("year");
  const [selectedYear, setSelectedYear] = useState(String(CURRENT_YEAR));
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [taxDetails, setTaxDetails] = useState<TaxDetails>(() => loadTaxDetails());
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
  const [isDownloading, setIsDownloading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [statementNotes, setStatementNotes] = useState("");
  const [selectedStatement, setSelectedStatement] = useState<BankStatement | null>(null);
  const [statementTransactions, setStatementTransactions] = useState<BankTransaction[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const { toast } = useToast();
  const { currency: displayCurrency, rates } = useFinanceDisplayCurrency();
  const display = (amount: number | string | null | undefined, source: Currency | string | null | undefined) =>
    convertFinanceAmount(amount, source, displayCurrency, rates);
  const fmt = (n: number) => formatMoney(n, displayCurrency);

  const periodLabel = useMemo(() => {
    const from = safeFormatDate(startDate);
    const to = safeFormatDate(endDate);
    return `${from} - ${to}`;
  }, [startDate, endDate, displayCurrency, rates]);

  const yearOptions = useMemo(
    () => Array.from({ length: 8 }, (_, i) => String(CURRENT_YEAR + 1 - i)),
    [],
  );

  useEffect(() => {
    fetchStatements();
    fetchReport();
  }, [startDate, endDate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TAX_STORAGE_KEY, JSON.stringify(taxDetails));
  }, [taxDetails]);

  function applyQuickPeriod(nextPeriod: QuickPeriod, nextYear = selectedYear) {
    setQuickPeriod(nextPeriod);
    if (nextPeriod === "custom") return;
    const nextRange = periodRange(Number(nextYear), nextPeriod);
    setStartDate(nextRange.start);
    setEndDate(nextRange.end);
  }

  function applyYear(nextYear: string) {
    setSelectedYear(nextYear);
    if (quickPeriod !== "custom") {
      const nextRange = periodRange(Number(nextYear), quickPeriod);
      setStartDate(nextRange.start);
      setEndDate(nextRange.end);
    }
  }

  async function fetchStatements() {
    setIsFetching(true);
    const response = await fetch(`/api/admin/finance/reconciliation?from=${encodeURIComponent(startDate)}&to=${encodeURIComponent(endDate)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setStatements(data.statements || []);
      setBankAccounts(data.accounts || []);
      setBankAccountId((current) => current || data.accounts?.[0]?.id || "");
    }
    setIsFetching(false);
  }

  async function fetchReport() {
    setIsReportLoading(true);
    const reportStart = safeDateKey(startDate) || initialRange.start;
    const reportEnd = safeDateKey(endDate) || reportStart;
    let response: Response;
    try {
      response = await fetch(`/api/admin/finance/reconciliation?report=1&from=${encodeURIComponent(reportStart)}&to=${encodeURIComponent(reportEnd)}`, { cache: "no-store" });
    } catch {
      setReport(null);
      setIsReportLoading(false);
      toast({ title: "Report unavailable", description: "The finance service could not be reached.", variant: "destructive" });
      return;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setReport(null);
      setIsReportLoading(false);
      toast({ title: "Report unavailable", description: payload.error || "The financial report could not be loaded.", variant: "destructive" });
      return;
    }
    const invoices = (payload.invoices || []) as InvoiceRow[];
    const invoicePayments = (payload.invoicePayments || []) as InvoicePaymentRow[];
    const inflows = (payload.inflows || []) as InflowRow[];
    const expenditures = (payload.expenditures || []) as ExpenditureRow[];
    const contractorPayments = (payload.contractorPayments || []) as ContractorPaymentRow[];
    const payrollRuns = (payload.payrollRuns || []) as PayrollRunRow[];
    const employees = (payload.employees || []) as EmployeeRow[];

    const receivedForInvoice = (invoice: InvoiceRow) => Number(invoice.amount_paid ?? (invoice.status === "paid" ? invoice.total : 0));
    const balanceForInvoice = (invoice: InvoiceRow) => Number(invoice.balance_due ?? Math.max(Number(invoice.total || 0) - receivedForInvoice(invoice), 0));
    const invoiceRevenue = invoicePayments.reduce((sum, payment) => sum + display(payment.amount, payment.currency), 0);
    const totalInflow = inflows.reduce((sum, entry) => sum + display(entry.amount, entry.currency), 0);
    const totalRevenue = invoiceRevenue + totalInflow;
    const outstandingReceivables = invoices
      .filter((invoice) => !["paid", "cancelled", "draft"].includes(invoice.status))
      .reduce((sum, invoice) => sum + display(balanceForInvoice(invoice), invoice.currency), 0);
    const operationsSpend = expenditures.reduce((sum, entry) => sum + display(entry.amount, entry.currency), 0);
    const contractorPay = contractorPayments.reduce((sum, entry) => sum + display(entry.amount, entry.currency), 0);
    const monthlyPayroll = employees.reduce((sum, employee) => sum + display(employee.base_salary, employee.currency), 0);
    const buckets = buildMonthBuckets(reportStart, reportEnd);

    invoicePayments.forEach((payment) => {
      const bucket = buckets.get(monthKey(payment.paid_on));
      if (bucket) bucket.revenue += display(payment.amount, payment.currency);
    });

    inflows.forEach((entry) => {
      const bucket = buckets.get(monthKey(entry.received_on));
      if (bucket) bucket.revenue += display(entry.amount, entry.currency);
    });

    expenditures.forEach((entry) => {
      const bucket = buckets.get(monthKey(entry.spent_on));
      if (bucket) bucket.operations += display(entry.amount, entry.currency);
    });

    contractorPayments.forEach((entry) => {
      const bucket = buckets.get(monthKey(entry.paid_on));
      if (bucket) bucket.contractors += display(entry.amount, entry.currency);
    });

    let payroll = payrollRuns.reduce((sum, run) => sum + display(run.total, run.currency), 0);
    if (payrollRuns.length > 0) {
      payrollRuns.forEach((run) => {
        const bucket = buckets.get(run.period);
        if (bucket) bucket.payroll += display(run.total, run.currency);
      });
    } else {
      payroll = monthlyPayroll * Math.max(1, buckets.size);
      buckets.forEach((bucket) => {
        bucket.payroll += monthlyPayroll;
      });
    }

    const chartData = Array.from(buckets.values()).map((bucket) => {
      const expenses = bucket.operations + bucket.contractors + bucket.payroll;
      return {
        ...bucket,
        expenses,
        net: bucket.revenue - expenses,
      };
    });

    const totalExpenses = operationsSpend + contractorPay + payroll;
    const netProfit = totalRevenue - totalExpenses;
    const totalAssets = totalRevenue + outstandingReceivables;
    const totalLiabilities = Math.max(0, totalExpenses - totalRevenue);
    const equity = totalAssets - totalLiabilities;
    const taxableRevenue = invoicePayments.reduce((sum, payment) => {
      const invoice = payment.finance_invoices;
      if (!invoice) return sum;
      const subtotal = invoice.subtotal == null ? Number(invoice.total || 0) - Number(invoice.tax_amount || 0) : Number(invoice.subtotal || 0);
      const collectedRatio = Number(invoice.total || 0) > 0 ? Number(payment.amount || 0) / Number(invoice.total) : 0;
      return sum + display(Math.max(0, subtotal * collectedRatio), payment.currency);
    }, 0);
    const invoiceTax = invoicePayments.reduce((sum, payment) => {
      const invoice = payment.finance_invoices;
      if (!invoice) return sum;
      const collectedRatio = Number(invoice.total || 0) > 0 ? Number(payment.amount || 0) / Number(invoice.total) : 0;
      return sum + display(Number(invoice.tax_amount || 0) * collectedRatio, payment.currency);
    }, 0);
    const expenseBreakdown: BreakdownPoint[] = [
      { name: "Operations", value: operationsSpend, color: "#0A4FE8" },
      { name: "Contractors", value: contractorPay, color: "#8B5CF6" },
      { name: "Payroll", value: payroll, color: "#F59E0B" },
    ].filter((entry) => entry.value > 0);

    const ledgerRows: LedgerRow[] = [
      ...invoicePayments.map((payment) => ({
        date: payment.paid_on,
        account: "Revenue",
        memo: payment.finance_invoices
          ? `${payment.finance_invoices.invoice_number} - ${payment.finance_invoices.client_name}`
          : `Invoice payment ${payment.invoice_id}`,
        debit: 0,
        credit: display(payment.amount, payment.currency),
      })),
      ...inflows.map((entry) => ({
        date: entry.received_on,
        account: "Inflow",
        memo: `${entry.title}${entry.source ? ` - ${entry.source}` : ""}`,
        debit: 0,
        credit: display(entry.amount, entry.currency),
      })),
      ...expenditures.map((entry) => ({
        date: entry.spent_on,
        account: entry.category || "Operating expense",
        memo: entry.title,
        debit: display(entry.amount, entry.currency),
        credit: 0,
      })),
      ...contractorPayments.map((entry) => ({
        date: entry.paid_on,
        account: "Contractor payments",
        memo: "Contractor payout",
        debit: display(entry.amount, entry.currency),
        credit: 0,
      })),
      ...payrollRuns.map((run) => ({
        date: `${run.period}-01`,
        account: "Payroll",
        memo: run.title,
        debit: display(run.total, run.currency),
        credit: 0,
      })),
    ]
      .sort((a, b) => sortTime(b.date) - sortTime(a.date))
      .slice(0, 12);

    setReport({
      totalRevenue,
      totalInflow,
      totalExpenses,
      netProfit,
      outstandingReceivables,
      totalAssets,
      totalLiabilities,
      equity,
      operationsSpend,
      contractorPay,
      payroll,
      taxableRevenue,
      invoiceTax,
      chartData,
      expenseBreakdown,
      ledgerRows,
      invoices,
      inflows,
      expenditures,
      contractorPayments,
      payrollRuns,
    });
    setIsReportLoading(false);
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setIsUploading(true);

    if (!bankAccountId) {
      toast({ title: "Select a bank", description: "Choose the account this statement belongs to.", variant: "destructive" });
      setIsUploading(false);
      return;
    }
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("bank_account_id", bankAccountId);
      form.set("notes", statementNotes);
      const response = await fetch("/api/admin/finance/reconciliation", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The statement could not be processed.");
      const result = data.result;
      toast({ title: "Statement reconciled", description: `${result.rowCount} transactions read · ${result.matchedCount} matched · ${result.otherInflowCount || 0} other inflows · ${result.reviewCount || 0} for review.` });
      setFile(null);
      setStatementNotes("");
      setShowUpload(false);
      await Promise.all([fetchStatements(), fetchReport()]);
    } catch (error) {
      toast({ title: "Reconciliation failed", description: error instanceof Error ? error.message : "The statement could not be processed.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(statement: BankStatement) {
    if (!(await appConfirm("Delete this bank statement?"))) return;
    const response = await fetch(`/api/admin/finance/reconciliation?id=${encodeURIComponent(statement.id)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) toast({ title: "Statement retained", description: data.error || "The statement could not be deleted.", variant: "destructive" });
    else fetchStatements();
  }

  async function openStatement(statement: BankStatement) {
    setSelectedStatement(statement);
    setStatementTransactions([]);
    setDetailsLoading(true);
    const response = await fetch(`/api/admin/finance/reconciliation?statement_id=${encodeURIComponent(statement.id)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setStatementTransactions(data.transactions || []);
    else toast({ title: "Could not load transactions", description: data.error || "Try again.", variant: "destructive" });
    setDetailsLoading(false);
  }

  async function handleDownload() {
    if (isDownloading) return;
    if (!report) {
      toast({ title: "No report ready", description: "Wait for the selected financial period to finish loading." });
      return;
    }

    setIsDownloading(true);
    try {
      const vatEstimate = report.invoiceTax ? report.invoiceTax : report.taxableRevenue * VAT_RATE;
      const rows = exportRows(report, periodLabel, taxDetails, vatEstimate);
      const suffix = `${startDate}_${endDate}`;

      if (exportFormat === "csv") {
        downloadBlob(rowsToCsv(rows), "text/csv;charset=utf-8", `cds-financial-audit-${suffix}.csv`);
      } else if (exportFormat === "xls") {
        downloadBlob(rowsToXls(rows), "application/vnd.ms-excel;charset=utf-8", `cds-financial-audit-${suffix}.xls`);
      } else {
        const { default: jsPDF } = await import("jspdf");
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 40;
        let y = 46;

        const clean = (value: string | number) => String(value ?? "").replace(/₦/g, "NGN ");
        const addPageIfNeeded = () => {
          if (y <= 758) return;
          doc.addPage();
          y = 46;
        };
        const writeRow = (cells: string[], isHeader = false) => {
          addPageIfNeeded();
          doc.setFont("helvetica", isHeader ? "bold" : "normal");
          doc.setFontSize(isHeader ? 9 : 8);
          doc.text(clean(cells[0] || ""), margin, y, { maxWidth: 94 });
          doc.text(clean(cells[1] || ""), margin + 104, y, { maxWidth: 132 });
          doc.text(clean(cells[2] || ""), margin + 246, y, { maxWidth: 82 });
          doc.text(clean(cells[3] || ""), margin + 338, y, { maxWidth: 62 });
          doc.text(clean(cells[4] || ""), margin + 410, y, { maxWidth: 62 });
          doc.text(clean(cells[5] || ""), margin + 482, y, { maxWidth: pageWidth - margin - 482 });
          y += isHeader ? 18 : 16;
        };

        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("CDS Space Financial Audit", margin, y);
        y += 20;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Period: ${periodLabel}`, margin, y);
        y += 26;
        writeRow(["Section", "Metric", "Value", "Debit", "Credit", "Date"], true);
        doc.setDrawColor(225, 229, 235);
        doc.line(margin, y - 10, pageWidth - margin, y - 10);

        rows.slice(1).forEach((row) => writeRow(row.slice(0, 6)));
        doc.save(`cds-financial-audit-${suffix}.pdf`);
      }

      toast({ title: "Download ready", description: `Financial audit exported as ${exportFormat.toUpperCase()}.` });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not export the financial audit.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  }

  const profitMargin = report?.totalRevenue ? (report.netProfit / report.totalRevenue) * 100 : 0;
  const expenseRatio = report?.totalRevenue ? (report.totalExpenses / report.totalRevenue) * 100 : report?.totalExpenses ? 100 : 0;
  const estimatedVat = report?.invoiceTax ? report.invoiceTax : (report?.taxableRevenue || 0) * VAT_RATE;
  const filingDays = daysUntil(taxDetails.filingDate);
  const taxStatusTone =
    taxDetails.filingStatus === "filed" || taxDetails.filingStatus === "remitted"
      ? "text-emerald-700 bg-emerald-50 ring-emerald-200"
      : filingDays == null
        ? "text-slate-700 bg-slate-50 ring-slate-200"
        : filingDays < 0
          ? "text-red-700 bg-red-50 ring-red-200"
          : filingDays <= 7
            ? "text-amber-700 bg-amber-50 ring-amber-200"
            : "text-blue-700 bg-blue-50 ring-blue-200";
  const hasExpenseBreakdown = !!report?.expenseBreakdown.length;

  return (
    <div className="p-6 sm:p-8 max-w-[1440px]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between mb-8">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Finance</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Financial Audit</h1>
          <p className="text-gray-400 text-[13px] mt-1">Generate reports, principal books, P&L, balance sheets, and reconcile bank statements</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <select
              aria-label="Download format"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              className="h-10 bg-white px-3 text-sm font-medium text-[#0D1B39] outline-none"
            >
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
              <option value="xls">.XLS</option>
            </select>
            <button
              onClick={handleDownload}
              disabled={isReportLoading || !report || isDownloading}
              className="flex h-10 items-center gap-2 border-l border-gray-200 px-4 text-sm font-medium text-[#0A4FE8] hover:bg-blue-50 transition disabled:opacity-50"
            >
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download
            </button>
          </div>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="flex w-fit items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition"
          >
            <Upload className="w-4 h-4" /> Upload Statement
          </button>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#0D1B39] font-semibold">
              <Filter className="w-4 h-4 text-[#0A4FE8]" />
              Period Filters
            </div>
            <p className="text-xs text-gray-400 mt-1">{periodLabel}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Year">
              <select
                value={selectedYear}
                onChange={(e) => applyYear(e.target.value)}
                className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-[#0D1B39] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              >
                {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </Field>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Quarter</div>
              <div className="flex flex-wrap gap-1.5 rounded-xl bg-gray-50 border border-gray-200 p-1">
                {QUICK_PERIODS.map((period) => (
                  <button
                    key={period.key}
                    onClick={() => applyQuickPeriod(period.key)}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition ${
                      quickPeriod === period.key ? "bg-[#0A4FE8] text-white shadow-sm" : "text-gray-500 hover:bg-white"
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="From">
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setQuickPeriod("custom"); setStartDate(e.target.value); }}
                className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-[#0D1B39] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setQuickPeriod("custom"); setEndDate(e.target.value); }}
                className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-[#0D1B39] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </Field>
          </div>
        </div>
      </section>

      {showUpload && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="text-[15px] font-semibold text-[#0D1B39] mb-4 flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#0A4FE8]" /> Upload Bank Statement
          </h2>
          <p className="text-xs text-gray-500 mb-4">Select the corporate bank account and upload a PDF, CSV, or Excel statement. Its period, credits, debits, invoice matches, and duplicate entries are processed automatically.</p>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Bank account">
                <select value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)} required className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm outline-none focus:border-[#0A4FE8] focus:ring-2 focus:ring-blue-100">
                  <option value="">Select bank account</option>
                  {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.bank_name} · {account.account_number || account.iban} · {account.currency}</option>)}
                </select>
              </Field>
              <Field label="Reconciliation note">
                <input value={statementNotes} onChange={(event) => setStatementNotes(event.target.value)} placeholder="Optional context for finance records" className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm outline-none focus:border-[#0A4FE8] focus:ring-2 focus:ring-blue-100" />
              </Field>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Statement File</label>
              <label className={`flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed cursor-pointer transition ${
                file ? "border-[#0A4FE8] bg-blue-50/30" : "border-gray-300 bg-gray-50 hover:border-[#0A4FE8] hover:bg-blue-50/30"
              }`}>
                <FileSpreadsheet className="w-6 h-6 text-gray-300 mb-2" />
                <p className="text-[13px] text-gray-500 font-medium">{file ? file.name : "Click to select PDF, CSV, or Excel"}</p>
                <input type="file" accept=".pdf,.csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isUploading || !file || !bankAccountId}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isUploading ? "Reading and reconciling…" : "Upload and reconcile"}
              </button>
              <button
                type="button"
                onClick={() => { setShowUpload(false); setFile(null); }}
                className="px-4 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Generate Reports</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <ReportCard
          icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
          label="Profit & Loss"
          desc="Income statement"
          bg="bg-emerald-50"
          onClick={() => setActiveReport("pl")}
          active={activeReport === "pl"}
        />
        <ReportCard
          icon={<Scale className="w-5 h-5 text-blue-600" />}
          label="Balance Sheet"
          desc="Assets, liabilities & equity"
          bg="bg-blue-50"
          onClick={() => setActiveReport("balance")}
          active={activeReport === "balance"}
        />
        <ReportCard
          icon={<BookOpen className="w-5 h-5 text-amber-600" />}
          label="General Ledger"
          desc="Principal books of account"
          bg="bg-amber-50"
          onClick={() => setActiveReport("ledger")}
          active={activeReport === "ledger"}
        />
        <ReportCard
          icon={<Download className="w-5 h-5 text-purple-600" />}
          label="Export All"
          desc={`Download as ${exportFormat.toUpperCase()}`}
          bg="bg-purple-50"
          onClick={handleDownload}
        />
      </div>

      {isReportLoading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 mb-8 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-[#0A4FE8]" />
        </div>
      ) : report && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <MetricCard icon={<TrendingUp className="w-4 h-4" />} label="Revenue" value={fmt(report.totalRevenue)} tone="emerald" />
            <MetricCard icon={<TrendingDown className="w-4 h-4" />} label="Expenses" value={fmt(report.totalExpenses)} tone="rose" />
            <MetricCard icon={<Wallet className="w-4 h-4" />} label={report.netProfit >= 0 ? "Net Profit" : "Net Loss"} value={`${report.netProfit < 0 ? "-" : ""}${fmt(Math.abs(report.netProfit))}`} tone={report.netProfit >= 0 ? "blue" : "amber"} />
            <MetricCard icon={<Receipt className="w-4 h-4" />} label="Receivables" value={fmt(report.outstandingReceivables)} tone="purple" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
            {activeReport === "pl" && <ProfitLossReport report={report} fmt={fmt} periodLabel={periodLabel} />}
            {activeReport === "balance" && <BalanceSheetReport report={report} fmt={fmt} periodLabel={periodLabel} />}
            {activeReport === "ledger" && <LedgerReport report={report} fmt={fmt} periodLabel={periodLabel} />}
          </div>

          <section className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.85fr] gap-5 mb-8">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold text-[#0D1B39]">Financial Charts</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{periodLabel}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 rounded-xl bg-gray-50 border border-gray-200 p-1">
                  <ChartTab active={activeChart === "trend"} onClick={() => setActiveChart("trend")} icon={<LineChart className="w-3.5 h-3.5" />} label="Trend" />
                  <ChartTab active={activeChart === "mix"} onClick={() => setActiveChart("mix")} icon={<PieChartIcon className="w-3.5 h-3.5" />} label="Mix" />
                  <ChartTab active={activeChart === "tax"} onClick={() => setActiveChart("tax")} icon={<Calculator className="w-3.5 h-3.5" />} label="Tax" />
                </div>
              </div>

              <div className="h-[320px]">
                {activeChart === "trend" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={report.chartData} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.24} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#F43F5E" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#9CA3AF", fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={formatCompact} tick={{ fill: "#9CA3AF", fontSize: 11 }} width={58} />
                      <Tooltip formatter={(value, name) => [fmt(Number(value || 0)), CHART_LABELS[String(name)] || String(name)]} contentStyle={{ borderRadius: 12, borderColor: "#E5E7EB" }} />
                      <Area type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2.5} fill="url(#revenueFill)" />
                      <Area type="monotone" dataKey="expenses" stroke="#F43F5E" strokeWidth={2.5} fill="url(#expenseFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}

                {activeChart === "mix" && (
                  hasExpenseBreakdown ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie data={report.expenseBreakdown} dataKey="value" nameKey="name" innerRadius={76} outerRadius={118} paddingAngle={4}>
                          {report.expenseBreakdown.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(value, name) => [fmt(Number(value || 0)), String(name)]} contentStyle={{ borderRadius: 12, borderColor: "#E5E7EB" }} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart icon={<PieChartIcon className="w-7 h-7" />} label="No expenses in this period" />
                  )
                )}

                {activeChart === "tax" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { label: "Taxable Revenue", value: report.taxableRevenue },
                      { label: "Invoice Tax", value: report.invoiceTax },
                      { label: "VAT Estimate", value: estimatedVat },
                    ]} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#9CA3AF", fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={formatCompact} tick={{ fill: "#9CA3AF", fontSize: 11 }} width={58} />
                      <Tooltip formatter={(value) => fmt(Number(value || 0))} contentStyle={{ borderRadius: 12, borderColor: "#E5E7EB" }} />
                      <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#0A4FE8" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-bold text-[#0D1B39]">Financial Analysis</h2>
              <p className="text-xs text-gray-400 mt-0.5 mb-5">{periodLabel}</p>
              <div className="space-y-3">
                <InsightCard label="Profit Margin" value={percent(profitMargin)} detail={`${fmt(report.netProfit)} net on ${fmt(report.totalRevenue)} revenue`} positive={report.netProfit >= 0} />
                <InsightCard label="Expense Ratio" value={percent(expenseRatio)} detail={`${fmt(report.totalExpenses)} spend in selected period`} positive={expenseRatio <= 65} />
                <InsightCard label="Invoice Tax Captured" value={fmt(report.invoiceTax)} detail={`${fmt(report.taxableRevenue)} taxable invoice base`} positive={report.invoiceTax > 0} />
                <InsightCard label="Cash Collection Gap" value={fmt(report.outstandingReceivables)} detail={`${report.invoices.filter((i) => ["sent", "partially_paid", "overdue"].includes(i.status)).length} invoice(s) with a balance`} positive={report.outstandingReceivables === 0} />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[#0D1B39]">Tax Compliance</h2>
                    <p className="text-xs text-gray-400">FIRS filing details and period tax analysis</p>
                  </div>
                </div>
              </div>
              <span className={`w-fit text-[11px] uppercase tracking-wider font-semibold px-3 py-1.5 rounded-full ring-1 ${taxStatusTone}`}>
                {taxDetails.filingStatus.replace("_", " ")}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <TaxStat icon={<Landmark className="w-4 h-4" />} label="Taxable Revenue" value={fmt(report.taxableRevenue)} />
              <TaxStat icon={<Receipt className="w-4 h-4" />} label="Invoice Tax" value={fmt(report.invoiceTax)} />
              <TaxStat icon={<Calculator className="w-4 h-4" />} label="VAT Estimate" value={fmt(estimatedVat)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <Field label="TIN">
                <input
                  value={taxDetails.tin}
                  onChange={(e) => setTaxDetails((d) => ({ ...d, tin: e.target.value }))}
                  placeholder="Tax identification number"
                  className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </Field>
              <Field label="FIRS Tax Office">
                <input
                  value={taxDetails.taxOffice}
                  onChange={(e) => setTaxDetails((d) => ({ ...d, taxOffice: e.target.value }))}
                  placeholder="e.g. Uyo MSTO"
                  className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </Field>
              <Field label="Filing Target Date">
                <input
                  type="date"
                  value={taxDetails.filingDate}
                  onChange={(e) => setTaxDetails((d) => ({ ...d, filingDate: e.target.value }))}
                  className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </Field>
              <Field label="FIRS Reference">
                <input
                  value={taxDetails.firsReference}
                  onChange={(e) => setTaxDetails((d) => ({ ...d, firsReference: e.target.value }))}
                  placeholder="Assessment or payment ref"
                  className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </Field>
              <Field label="Filing Status">
                <select
                  value={taxDetails.filingStatus}
                  onChange={(e) => setTaxDetails((d) => ({ ...d, filingStatus: e.target.value as TaxDetails["filingStatus"] }))}
                  className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="not_started">Not started</option>
                  <option value="preparing">Preparing</option>
                  <option value="filed">Filed</option>
                  <option value="remitted">Remitted</option>
                </select>
              </Field>
            </div>

            <div className="mt-5 rounded-xl bg-gray-50 border border-gray-100 p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm text-[#0D1B39]">
                {filingDays != null && filingDays < 0 ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <Calendar className="w-4 h-4 text-[#0A4FE8]" />}
                <span className="font-medium">
                  {filingDays == null
                    ? "No filing target date set"
                    : filingDays < 0
                      ? `${Math.abs(filingDays)} day(s) past target`
                      : `${filingDays} day(s) to filing target`}
                </span>
              </div>
              <p className="text-xs text-gray-400">Values come from invoices in the selected period.</p>
            </div>
          </section>
        </>
      )}

      <h2 className="mb-4 text-sm font-semibold text-gray-500">Uploaded bank statements</h2>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isFetching ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
        ) : statements.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardCheck className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No bank statements uploaded in this period</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {statements.map((statement) => (
              <div key={statement.id} className="flex flex-col gap-4 px-6 py-4 transition hover:bg-blue-50/30 sm:flex-row sm:items-center">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#0A4FE8] flex-shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#0D1B39]">{statement.filename}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400 mt-0.5">
                    {statement.bank_name && <span>{statement.bank_name}</span>}
                    {statement.account_number && <span>•••{statement.account_number.slice(-4)}</span>}
                    {(statement.period_start || statement.period_end) && <span>{statement.period_start || "-"} to {statement.period_end || "-"}</span>}
                    <span>Uploaded {new Date(statement.uploaded_at).toLocaleDateString()}</span>
                    <span className="text-emerald-700">Credit {statement.currency} {Number(statement.total_credit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-red-600">Debit {statement.currency} {Number(statement.total_debit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold">
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{statement.row_count || 0} transactions</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{statement.matched_count || 0} reconciled</span>
                    {Number(statement.other_inflow_count || 0) > 0 && <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{statement.other_inflow_count} other inflows</span>}
                    {Number(statement.review_count || statement.unmatched_count || 0) > 0 && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{statement.review_count || statement.unmatched_count} need review</span>}
                    {Number(statement.duplicate_count || 0) > 0 && <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">{statement.duplicate_count} duplicates skipped</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statement.processing_status === "completed" ? "bg-emerald-50 text-emerald-700" : statement.processing_status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{statement.processing_status.replace(/_/g, " ")}</span>
                  <button onClick={() => void openStatement(statement)} className="rounded-lg bg-[#0A4FE8] px-3 py-2 text-[11px] font-semibold text-white">View details</button>
                  {statement.processing_status === "failed" && <button onClick={() => handleDelete(statement)} className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500" aria-label="Delete failed statement"><Trash2 className="w-4 h-4" /></button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {selectedStatement && (
        <div className="fixed inset-0 z-[160] grid place-items-center bg-[#06103A]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Bank statement transactions" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedStatement(null); }}>
          <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
              <div><p className="text-xs font-semibold text-[#0A4FE8]">{selectedStatement.bank_name} · {selectedStatement.currency}</p><h3 className="mt-1 text-lg font-bold text-[#0D1B39]">{selectedStatement.filename}</h3><p className="mt-1 text-xs text-gray-500">{selectedStatement.period_start || "-"} to {selectedStatement.period_end || "-"}</p></div>
              <button type="button" onClick={() => setSelectedStatement(null)} className="rounded-full bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">Close</button>
            </div>
            <div className="max-h-[75vh] overflow-auto">
              {detailsLoading ? <div className="grid min-h-56 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div> : (
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-gray-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3 text-right">Credit</th><th className="px-4 py-3 text-right">Debit</th><th className="px-4 py-3">Reconciliation</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">{statementTransactions.map((transaction) => <tr key={transaction.id}><td className="whitespace-nowrap px-4 py-3">{transaction.txn_date}</td><td className="max-w-sm px-4 py-3"><p className="font-medium text-[#0D1B39]">{transaction.description}</p>{transaction.category && <p className="mt-1 text-[10px] text-gray-400">{transaction.category}</p>}</td><td className="px-4 py-3 font-mono text-[10px] text-gray-500">{transaction.transaction_reference || "-"}</td><td className="px-4 py-3 text-right font-semibold text-emerald-700">{transaction.txn_type === "credit" ? `${selectedStatement.currency} ${Number(transaction.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}</td><td className="px-4 py-3 text-right font-semibold text-red-600">{transaction.txn_type === "debit" ? `${selectedStatement.currency} ${Number(transaction.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}</td><td className="max-w-xs px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${transaction.match_status === "needs_review" ? "bg-amber-50 text-amber-700" : transaction.match_status === "already_recorded" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{transaction.match_status.replace(/_/g, " ")}</span>{transaction.invoice_number && <p className="mt-1 font-semibold text-[#0D1B39]">{transaction.invoice_number} · {transaction.client_name}</p>}{transaction.match_reason && <p className="mt-1 text-[10px] leading-4 text-gray-500">{transaction.match_reason}</p>}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportCard({ icon, label, desc, bg, onClick, active }: { icon: ReactNode; label: string; desc: string; bg: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border p-5 transition-all ${active ? "border-[#0A4FE8] bg-blue-50/30 shadow-md" : "border-gray-100 bg-white shadow-sm hover:border-blue-200 hover:shadow-md"}`}
    >
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>{icon}</div>
      <p className="text-[14px] font-semibold text-[#0D1B39]">{label}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
    </button>
  );
}

function MetricCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "emerald" | "rose" | "blue" | "amber" | "purple" }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    purple: "bg-purple-50 text-purple-700",
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 ${tones[tone]}`}>{icon}</div>
      <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">{label}</p>
      <p className="text-2xl font-bold text-[#0D1B39] mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function ProfitLossReport({ report, fmt, periodLabel }: { report: FinancialReport; fmt: (n: number) => string; periodLabel: string }) {
  return (
    <div>
      <h3 className="text-lg font-bold text-[#0D1B39] mb-1">Profit & Loss Statement</h3>
      <p className="text-xs text-gray-400 mb-6">{periodLabel}</p>
      <div className="space-y-3">
        <Row label="Revenue" value={fmt(report.totalRevenue)} bold />
        <Row label="Recorded Inflow" value={fmt(report.totalInflow)} />
        <Row label="Operating Expenses" value={`-${fmt(report.operationsSpend)}`} />
        <Row label="Contractor Payments" value={`-${fmt(report.contractorPay)}`} />
        <Row label="Payroll" value={`-${fmt(report.payroll)}`} />
        <div className="border-t border-gray-200 pt-3">
          <Row
            label="Net Profit / Loss"
            value={`${report.netProfit < 0 ? "-" : ""}${fmt(Math.abs(report.netProfit))}`}
            bold
            color={report.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}
          />
        </div>
      </div>
    </div>
  );
}

function BalanceSheetReport({ report, fmt, periodLabel }: { report: FinancialReport; fmt: (n: number) => string; periodLabel: string }) {
  return (
    <div>
      <h3 className="text-lg font-bold text-[#0D1B39] mb-1">Balance Sheet</h3>
      <p className="text-xs text-gray-400 mb-6">{periodLabel}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h4 className="text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Assets</h4>
          <Row label="Collected Revenue + Inflow" value={fmt(report.totalRevenue)} />
          <Row label="Outstanding Receivables" value={fmt(report.outstandingReceivables)} />
          <Row label="Total Assets" value={fmt(report.totalAssets)} bold />
        </div>
        <div>
          <h4 className="text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Liabilities & Equity</h4>
          <Row label="Estimated Liabilities" value={fmt(report.totalLiabilities)} />
          <Row label="Equity" value={fmt(report.equity)} bold />
        </div>
      </div>
    </div>
  );
}

function LedgerReport({ report, fmt, periodLabel }: { report: FinancialReport; fmt: (n: number) => string; periodLabel: string }) {
  return (
    <div>
      <h3 className="text-lg font-bold text-[#0D1B39] mb-1">General Ledger</h3>
      <p className="text-xs text-gray-400 mb-6">{periodLabel}</p>
      {report.ledgerRows.length === 0 ? (
        <p className="text-sm text-gray-500">No ledger entries in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400">
                <th className="py-3 pr-4">Date</th>
                <th className="py-3 pr-4">Account</th>
                <th className="py-3 pr-4">Memo</th>
                <th className="py-3 pr-4 text-right">Debit</th>
                <th className="py-3 text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.ledgerRows.map((row, index) => (
                <tr key={`${row.date}-${row.memo}-${index}`}>
                  <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">{safeFormatDate(row.date)}</td>
                  <td className="py-3 pr-4 font-medium text-[#0D1B39]">{row.account}</td>
                  <td className="py-3 pr-4 text-gray-500">{row.memo}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{row.debit ? fmt(row.debit) : "-"}</td>
                  <td className="py-3 text-right tabular-nums">{row.credit ? fmt(row.credit) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ChartTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${active ? "bg-[#0A4FE8] text-white shadow-sm" : "text-gray-500 hover:bg-white"}`}
    >
      {icon}{label}
    </button>
  );
}

function InsightCard({ label, value, detail, positive }: { label: string; value: string; detail: string; positive: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] uppercase tracking-wider text-gray-400 font-semibold">{label}</p>
        {positive ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
      </div>
      <p className="text-2xl font-bold text-[#0D1B39] mt-2 tabular-nums">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{detail}</p>
    </div>
  );
}

function TaxStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
      <div className="w-8 h-8 rounded-lg bg-white text-[#0A4FE8] flex items-center justify-center mb-3">{icon}</div>
      <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">{label}</p>
      <p className="text-xl font-bold text-[#0D1B39] mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function EmptyChart({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="h-full rounded-2xl bg-gray-50 border border-gray-100 flex flex-col items-center justify-center text-gray-400">
      {icon}
      <p className="text-sm font-medium mt-2">{label}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className={`text-[14px] ${bold ? "font-semibold text-[#0D1B39]" : "text-gray-600"}`}>{label}</span>
      <span className={`text-[14px] tabular-nums text-right ${bold ? "font-bold" : ""} ${color || "text-[#0D1B39]"}`}>{value}</span>
    </div>
  );
}
