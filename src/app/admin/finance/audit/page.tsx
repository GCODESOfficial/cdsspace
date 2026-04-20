"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardCheck, Upload, FileText, BookOpen, TrendingUp, Scale, Loader2,
  Download, FileSpreadsheet, Trash2, Calendar, Receipt, Wallet, ArrowRight,
} from "lucide-react";

interface BankStatement {
  id: string;
  filename: string;
  bank_name: string | null;
  account_number: string | null;
  period_start: string | null;
  period_end: string | null;
  total_credit: number;
  total_debit: number;
  uploaded_at: string;
}

interface FinancialReport {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
}

export default function FinancialAuditPage() {
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [activeReport, setActiveReport] = useState<"none" | "pl" | "balance" | "ledger">("none");
  const [showUpload, setShowUpload] = useState(false);

  // Upload form
  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const { toast } = useToast();

  useEffect(() => { fetchStatements(); fetchReport(); }, []);

  async function fetchStatements() {
    setIsFetching(true);
    const { data } = await supabase.from("finance_bank_statements").select("*").order("uploaded_at", { ascending: false });
    setStatements(data || []);
    setIsFetching(false);
  }

  async function fetchReport() {
    const [invoicesRes, expendituresRes, contractorPayRes, payrollRes] = await Promise.all([
      supabase.from("finance_invoices").select("total, status"),
      supabase.from("finance_expenditures").select("amount"),
      supabase.from("finance_contractor_payments").select("amount"),
      supabase.from("finance_employees").select("base_salary").eq("active", true),
    ]);

    const totalRevenue = (invoicesRes.data || [])
      .filter(i => i.status === "paid")
      .reduce((s, i) => s + Number(i.total || 0), 0);

    const expenditures = (expendituresRes.data || []).reduce((s, e) => s + Number(e.amount || 0), 0);
    const contractorPay = (contractorPayRes.data || []).reduce((s, c) => s + Number(c.amount || 0), 0);
    const payroll = (payrollRes.data || []).reduce((s, p) => s + Number(p.base_salary || 0), 0);
    const totalExpenses = expenditures + contractorPay + payroll;

    const outstanding = (invoicesRes.data || [])
      .filter(i => i.status === "sent" || i.status === "overdue")
      .reduce((s, i) => s + Number(i.total || 0), 0);

    const netProfit = totalRevenue - totalExpenses;
    const totalAssets = totalRevenue + outstanding; // simplified
    const totalLiabilities = 0; // could be expanded later
    const equity = totalAssets - totalLiabilities;

    setReport({ totalRevenue, totalExpenses, netProfit, totalAssets, totalLiabilities, equity });
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setIsUploading(true);

    const fileName = `${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("bank-statements").upload(fileName, file, { contentType: file.type });

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setIsUploading(false);
      return;
    }

    const { error } = await supabase.from("finance_bank_statements").insert({
      filename: file.name,
      storage_path: fileName,
      bank_name: bankName || null,
      account_number: accountNumber || null,
      total_credit: 0,
      total_debit: 0,
    });

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Uploaded", description: "Bank statement saved. Auto-classification will run shortly." });
      setFile(null);
      setBankName("");
      setAccountNumber("");
      setShowUpload(false);
      fetchStatements();
    }
    setIsUploading(false);
  }

  async function handleDelete(id: string, path: string) {
    if (!confirm("Delete this bank statement?")) return;
    await supabase.storage.from("bank-statements").remove([path]);
    await supabase.from("finance_bank_statements").delete().eq("id", id);
    fetchStatements();
  }

  const fmt = (n: number) => `₦${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Finance</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Financial Audit</h1>
          <p className="text-gray-400 text-[13px] mt-1">Generate reports, principal books, P&L, balance sheets, and reconcile bank statements</p>
        </div>
        <button onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition">
          <Upload className="w-4 h-4" /> Upload Statement
        </button>
      </div>

      {/* Upload Form */}
      {showUpload && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="text-[15px] font-semibold text-[#0D1B39] mb-4 flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#0A4FE8]" /> Upload Bank Statement
          </h2>
          <p className="text-xs text-gray-500 mb-4">Upload a PDF or CSV bank statement. The system will auto-sort transactions into the right database.</p>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Bank Name</label>
                <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. GTBank"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Account Number</label>
                <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="0123456789"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Statement File</label>
              <label className={`flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed cursor-pointer transition ${
                file ? "border-[#0A4FE8] bg-blue-50/30" : "border-gray-300 bg-gray-50 hover:border-[#0A4FE8] hover:bg-blue-50/30"
              }`}>
                <FileSpreadsheet className="w-6 h-6 text-gray-300 mb-2" />
                <p className="text-[13px] text-gray-500 font-medium">{file ? file.name : "Click to select PDF or CSV"}</p>
                <input type="file" accept=".pdf,.csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={isUploading || !file}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50">
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isUploading ? "Uploading..." : "Upload & Process"}
              </button>
              <button type="button" onClick={() => { setShowUpload(false); setFile(null); }}
                className="px-4 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Report Generators */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Generate Reports</h2>
      <div className="grid grid-cols-4 gap-4 mb-8">
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
          desc="Download as PDF/Excel"
          bg="bg-purple-50"
          onClick={() => toast({ title: "Coming soon", description: "Export will be available shortly" })}
        />
      </div>

      {/* Active Report Display */}
      {activeReport !== "none" && report && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
          {activeReport === "pl" && <ProfitLossReport report={report} fmt={fmt} />}
          {activeReport === "balance" && <BalanceSheetReport report={report} fmt={fmt} />}
          {activeReport === "ledger" && <LedgerReport fmt={fmt} />}
        </div>
      )}

      {/* Bank Statements List */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Uploaded Bank Statements</h2>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isFetching ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
        ) : statements.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardCheck className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No bank statements uploaded yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {statements.map(s => (
              <div key={s.id} className="flex items-center gap-4 px-6 py-4 hover:bg-blue-50/30 transition">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#0A4FE8] flex-shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#0D1B39]">{s.filename}</p>
                  <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5">
                    {s.bank_name && <span>{s.bank_name}</span>}
                    {s.account_number && <span>•••{s.account_number.slice(-4)}</span>}
                    <span>{new Date(s.uploaded_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <button onClick={() => handleDelete(s.id, s.filename)}
                  className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportCard({ icon, label, desc, bg, onClick, active }: any) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-2xl border p-5 transition-all ${active ? "border-[#0A4FE8] bg-blue-50/30 shadow-md" : "border-gray-100 bg-white shadow-sm hover:border-blue-200 hover:shadow-md"}`}>
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>{icon}</div>
      <p className="text-[14px] font-semibold text-[#0D1B39]">{label}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
    </button>
  );
}

function ProfitLossReport({ report, fmt }: { report: FinancialReport; fmt: (n: number) => string }) {
  return (
    <div>
      <h3 className="text-lg font-bold text-[#0D1B39] mb-1">Profit & Loss Statement</h3>
      <p className="text-xs text-gray-400 mb-6">As of {new Date().toLocaleDateString()}</p>
      <div className="space-y-3">
        <Row label="Revenue" value={fmt(report.totalRevenue)} bold />
        <Row label="Total Expenses" value={`-${fmt(report.totalExpenses)}`} />
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

function BalanceSheetReport({ report, fmt }: { report: FinancialReport; fmt: (n: number) => string }) {
  return (
    <div>
      <h3 className="text-lg font-bold text-[#0D1B39] mb-1">Balance Sheet</h3>
      <p className="text-xs text-gray-400 mb-6">As of {new Date().toLocaleDateString()}</p>
      <div className="grid grid-cols-2 gap-8">
        <div>
          <h4 className="text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Assets</h4>
          <Row label="Total Assets" value={fmt(report.totalAssets)} bold />
        </div>
        <div>
          <h4 className="text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Liabilities & Equity</h4>
          <Row label="Total Liabilities" value={fmt(report.totalLiabilities)} />
          <Row label="Equity" value={fmt(report.equity)} bold />
        </div>
      </div>
    </div>
  );
}

function LedgerReport({ fmt }: { fmt: (n: number) => string }) {
  return (
    <div>
      <h3 className="text-lg font-bold text-[#0D1B39] mb-1">General Ledger</h3>
      <p className="text-xs text-gray-400 mb-6">Principal books of account</p>
      <p className="text-sm text-gray-500">Detailed transaction listing across all accounts. Connect bank statements to populate this report automatically.</p>
    </div>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={`text-[14px] ${bold ? "font-semibold text-[#0D1B39]" : "text-gray-600"}`}>{label}</span>
      <span className={`text-[14px] tabular-nums ${bold ? "font-bold" : ""} ${color || "text-[#0D1B39]"}`}>{value}</span>
    </div>
  );
}
