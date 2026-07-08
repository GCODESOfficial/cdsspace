"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  PieChart,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
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

type ReportStats = {
  totalTrackedEvents: number;
  logins: number;
  conversations: number;
  messages: number;
  works: number;
  invoices: number;
  activeActors: number;
  clients: number;
  teamMembers: number;
};

type MonthlyRow = {
  key: string;
  label: string;
  logins: number;
  messages: number;
  works: number;
  invoices: number;
  projects: number;
  adminActions: number;
};

type ActivityItem = {
  id: string;
  actor_kind: "admin" | "team" | "system";
  actor_name: string;
  actor_is_admin: boolean;
  action: string;
  resource_type: string;
  resource_id: string | null;
  resource_label: string | null;
  page: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ActorRow = {
  name: string;
  kind: string;
  isAdmin: boolean;
  events: number;
  lastSeen: string;
};

type SourceMetric = {
  key: string;
  label: string;
  count: number;
  available: boolean;
};

type AuditReport = {
  ok: true;
  generatedAt: string;
  period: { from: string; to: string; fromIso: string; toIso: string };
  stats: ReportStats;
  monthly: MonthlyRow[];
  categoryBreakdown: Array<{ category: string; count: number }>;
  actors: ActorRow[];
  recentActivities: ActivityItem[];
  sourceMetrics: SourceMetric[];
  unavailableSources: string[];
};

type PeriodMode = "today" | "week" | "month" | "year" | "q1" | "q2" | "q3" | "q4" | "custom";

const PERIOD_MODES: PeriodMode[] = ["today", "week", "month", "year", "q1", "q2", "q3", "q4", "custom"];

const PERIOD_LABELS: Record<PeriodMode, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  year: "Year",
  q1: "Q1",
  q2: "Q2",
  q3: "Q3",
  q4: "Q4",
  custom: "Custom",
};

const CHART_COLORS = ["#0A4FE8", "#18A058", "#EA580C", "#7C3AED", "#0EA5E9", "#F43F5E", "#64748B"];

const VERB_LABELS: Record<string, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  suspend: "suspended",
  unsuspend: "reactivated",
  promote: "promoted",
  demote: "demoted",
  assign: "assigned",
  unassign: "removed",
  invite: "invited",
  send: "sent",
  login: "logged in",
  mark_paid: "marked paid",
  restore_version: "restored version",
  surcharge: "added surcharge",
  archive: "archived",
};

function toISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangeForMode(year: number, mode: PeriodMode) {
  // Today / this week / this month are relative to the current date and ignore
  // the selected year.
  if (mode === "today") {
    const today = toISODate(new Date());
    return { from: today, to: today };
  }
  if (mode === "week") {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay()); // Sunday start
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: toISODate(start), to: toISODate(end) };
  }
  if (mode === "month") {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: toISODate(first), to: toISODate(last) };
  }
  if (mode === "q1") return { from: `${year}-01-01`, to: `${year}-03-31` };
  if (mode === "q2") return { from: `${year}-04-01`, to: `${year}-06-30` };
  if (mode === "q3") return { from: `${year}-07-01`, to: `${year}-09-30` };
  if (mode === "q4") return { from: `${year}-10-01`, to: `${year}-12-31` };
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}

function prettyAction(action: string) {
  const [noun = "activity", verb = "update"] = action.split(".");
  return {
    noun: noun.replace(/_/g, " "),
    verb: VERB_LABELS[verb] || verb.replace(/_/g, " "),
  };
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 2) {
  const words = text.split(" ");
  let line = "";
  let lines = 0;
  for (let i = 0; i < words.length; i += 1) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      lines += 1;
      line = words[i];
      if (lines >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y);
}

function createReportCanvas(report: AuditReport) {
  const width = 1600;
  const height = 2180;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");

  ctx.fillStyle = "#F0F5FF";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#0D1B39";
  ctx.font = "700 54px Inter, Arial, sans-serif";
  ctx.fillText("CDS Space Audit & Report", 80, 95);
  ctx.font = "500 25px Inter, Arial, sans-serif";
  ctx.fillStyle = "#64748B";
  ctx.fillText(`Period: ${report.period.from} to ${report.period.to}`, 80, 135);
  ctx.fillText(`Generated: ${formatDateTime(report.generatedAt)}`, 80, 170);

  const cards = [
    ["Tracked events", report.stats.totalTrackedEvents, "#0A4FE8"],
    ["Logins", report.stats.logins, "#7C3AED"],
    ["Messages", report.stats.messages, "#18A058"],
    ["Works & requests", report.stats.works, "#EA580C"],
    ["Invoices", report.stats.invoices, "#0EA5E9"],
    ["Active actors", report.stats.activeActors, "#F43F5E"],
  ];

  cards.forEach(([label, value, color], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = 80 + col * 480;
    const y = 235 + row * 175;
    drawRoundRect(ctx, x, y, 430, 130, 24);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.fillStyle = color as string;
    ctx.fillRect(x, y, 8, 130);
    ctx.fillStyle = "#64748B";
    ctx.font = "600 24px Inter, Arial, sans-serif";
    ctx.fillText(label as string, x + 34, y + 42);
    ctx.fillStyle = "#0D1B39";
    ctx.font = "800 46px Inter, Arial, sans-serif";
    ctx.fillText(formatNumber(value as number), x + 34, y + 96);
  });

  ctx.fillStyle = "#0D1B39";
  ctx.font = "700 34px Inter, Arial, sans-serif";
  ctx.fillText("Monthly activity", 80, 625);

  const chartX = 80;
  const chartY = 670;
  const chartW = 1440;
  const chartH = 420;
  drawRoundRect(ctx, chartX, chartY, chartW, chartH, 28);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();

  const maxMonthly = Math.max(1, ...report.monthly.map((m) => m.logins + m.messages + m.works + m.invoices + m.projects + m.adminActions));
  const barWidth = Math.max(28, Math.min(70, (chartW - 140) / Math.max(1, report.monthly.length) - 20));
  report.monthly.forEach((row, index) => {
    const total = row.logins + row.messages + row.works + row.invoices + row.projects + row.adminActions;
    const x = chartX + 80 + index * ((chartW - 140) / Math.max(1, report.monthly.length));
    const h = (total / maxMonthly) * 260;
    ctx.fillStyle = "#0A4FE8";
    drawRoundRect(ctx, x, chartY + 315 - h, barWidth, h, 10);
    ctx.fill();
    ctx.fillStyle = "#64748B";
    ctx.font = "500 18px Inter, Arial, sans-serif";
    ctx.save();
    ctx.translate(x + 4, chartY + 360);
    ctx.rotate(-0.65);
    ctx.fillText(row.label, 0, 0);
    ctx.restore();
  });

  ctx.fillStyle = "#0D1B39";
  ctx.font = "700 34px Inter, Arial, sans-serif";
  ctx.fillText("Category mix", 80, 1170);
  ctx.fillText("Top actors", 820, 1170);

  const mixTop = report.categoryBreakdown.slice(0, 7);
  const maxMix = Math.max(1, ...mixTop.map((row) => row.count));
  mixTop.forEach((row, index) => {
    const y = 1225 + index * 55;
    ctx.fillStyle = "#334155";
    ctx.font = "600 21px Inter, Arial, sans-serif";
    ctx.fillText(row.category, 80, y);
    ctx.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
    drawRoundRect(ctx, 310, y - 22, (row.count / maxMix) * 390, 24, 12);
    ctx.fill();
    ctx.fillStyle = "#0D1B39";
    ctx.font = "700 20px Inter, Arial, sans-serif";
    ctx.fillText(formatNumber(row.count), 725, y);
  });

  report.actors.slice(0, 8).forEach((actor, index) => {
    const y = 1225 + index * 55;
    ctx.fillStyle = actor.isAdmin ? "#0A4FE8" : "#18A058";
    drawRoundRect(ctx, 820, y - 28, 38, 38, 19);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "700 17px Inter, Arial, sans-serif";
    ctx.fillText(actor.name.slice(0, 1).toUpperCase(), 833, y - 4);
    ctx.fillStyle = "#0D1B39";
    ctx.font = "700 21px Inter, Arial, sans-serif";
    wrapText(ctx, actor.name, 875, y - 8, 390, 24, 1);
    ctx.fillStyle = "#64748B";
    ctx.font = "500 18px Inter, Arial, sans-serif";
    ctx.fillText(`${formatNumber(actor.events)} events`, 1320, y - 8);
    ctx.fillText(timeAgo(actor.lastSeen), 1320, y + 18);
  });

  ctx.fillStyle = "#0D1B39";
  ctx.font = "700 34px Inter, Arial, sans-serif";
  ctx.fillText("Recent activity", 80, 1710);

  report.recentActivities.slice(0, 8).forEach((item, index) => {
    const { noun, verb } = prettyAction(item.action);
    const y = 1760 + index * 46;
    ctx.fillStyle = item.actor_is_admin ? "#0A4FE8" : "#18A058";
    drawRoundRect(ctx, 80, y - 25, 30, 30, 15);
    ctx.fill();
    ctx.fillStyle = "#0D1B39";
    ctx.font = "700 20px Inter, Arial, sans-serif";
    ctx.fillText(item.actor_name, 128, y - 6);
    ctx.fillStyle = "#64748B";
    ctx.font = "500 20px Inter, Arial, sans-serif";
    wrapText(ctx, `${verb} ${noun}${item.resource_label ? ` - ${item.resource_label}` : ""}`, 360, y - 6, 830, 24, 1);
    ctx.fillText(formatDateTime(item.created_at), 1230, y - 6);
  });

  return canvas;
}

export default function AuditReportPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [mode, setMode] = useState<PeriodMode>("today");
  const initialRange = rangeForMode(currentYear, "today");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState<"png" | "pdf" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchReport = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/audit-report?from=${from}&to=${to}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Unable to load audit report.");
        if (!cancelled) setReport(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load audit report.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchReport();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const filteredActivities = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    if (!q) return report.recentActivities;
    return report.recentActivities.filter((item) =>
      [item.actor_name, item.action, item.resource_type, item.resource_label, item.page]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [report, query]);

  const filteredActors = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    if (!q) return report.actors;
    return report.actors.filter((actor) => actor.name.toLowerCase().includes(q) || actor.kind.toLowerCase().includes(q));
  }, [report, query]);

  const availableSources = report?.sourceMetrics.filter((source) => source.available) || [];

  const applyMode = (nextMode: PeriodMode) => {
    setMode(nextMode);
    if (nextMode !== "custom") {
      const range = rangeForMode(year, nextMode);
      setFrom(range.from);
      setTo(range.to);
    }
  };

  const applyYear = (value: number) => {
    setYear(value);
    if (mode !== "custom") {
      const range = rangeForMode(value, mode);
      setFrom(range.from);
      setTo(range.to);
    }
  };

  const handleDownloadPng = async () => {
    if (!report) return;
    setExporting("png");
    try {
      const canvas = createReportCanvas(report);
      downloadDataUrl(canvas.toDataURL("image/png"), `cds-audit-report-${report.period.from}_${report.period.to}.png`);
    } finally {
      setExporting(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (!report) return;
    setExporting("pdf");
    try {
      const { default: jsPDF } = await import("jspdf");
      const canvas = createReportCanvas(report);
      const img = canvas.toDataURL("image/png");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 24;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      let y = margin;
      doc.addImage(img, "PNG", margin, y, imgW, imgH);
      let remaining = imgH - (pageH - margin * 2);
      while (remaining > 0) {
        doc.addPage();
        y -= pageH - margin * 2;
        doc.addImage(img, "PNG", margin, y, imgW, imgH);
        remaining -= pageH - margin * 2;
      }
      doc.save(`cds-audit-report-${report.period.from}_${report.period.to}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1480px] space-y-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#0A4FE8]">Platform intelligence</p>
            <h1 className="text-[28px] font-bold tracking-tight text-[#0D1B39]">Audit & Report</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Overview of logins, chats, messages, works, invoices, admin actions, team actions, graphs, and recent activity.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search activities..."
                className="h-11 w-full rounded-2xl border border-white/80 bg-white pl-9 pr-4 text-sm text-[#0D1B39] shadow-sm outline-none transition focus:border-blue-200 focus:ring-4 focus:ring-blue-100 sm:w-[260px]"
              />
            </div>
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={!report || exporting !== null}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/80 bg-white px-4 text-sm font-semibold text-[#0D1B39] shadow-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              PNG
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!report || exporting !== null}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#0A4FE8] px-4 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-[#083EC0] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              PDF
            </button>
          </div>
        </header>

        <section className="rounded-[20px] border border-white/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-4 xl:grid-cols-[1fr_auto_auto] xl:items-end">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0A4FE8]">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#0D1B39]">Period Filters</p>
                <p className="text-xs text-slate-400">{from} - {to}</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-[88px_1fr] sm:items-end">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Year
                <select
                  value={year}
                  onChange={(event) => applyYear(Number(event.target.value))}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-[#0D1B39] outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                >
                  {Array.from({ length: 6 }, (_, index) => currentYear - index).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Range</p>
                <div className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                  {PERIOD_MODES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => applyMode(item)}
                      className={`h-9 whitespace-nowrap rounded-xl px-3 text-xs font-bold uppercase transition ${
                        mode === item ? "bg-[#0A4FE8] text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-[#0D1B39]"
                      }`}
                    >
                      {PERIOD_LABELS[item]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(event) => {
                    setMode("custom");
                    setFrom(event.target.value);
                  }}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-[#0D1B39] outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(event) => {
                    setMode("custom");
                    setTo(event.target.value);
                  }}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-[#0D1B39] outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
              </label>
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-white/80 bg-white">
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading audit report...
            </div>
          </div>
        ) : report ? (
          <>
            {report.unavailableSources.length > 0 && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-700">
                Some optional sources are not available in this environment: {report.unavailableSources.slice(0, 8).join(", ")}
                {report.unavailableSources.length > 8 ? "..." : ""}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={<Activity />} label="Tracked events" value={report.stats.totalTrackedEvents} tone="blue" />
              <MetricCard icon={<ShieldCheck />} label="Logins" value={report.stats.logins} tone="purple" />
              <MetricCard icon={<MessageSquare />} label="Messages" value={report.stats.messages} tone="green" />
              <MetricCard icon={<FileText />} label="Invoices created" value={report.stats.invoices} tone="orange" />
              <MetricCard icon={<BarChart3 />} label="Works & requests" value={report.stats.works} tone="blue" />
              <MetricCard icon={<Users />} label="Active actors" value={report.stats.activeActors} tone="purple" />
              <MetricCard icon={<Users />} label="Client accounts" value={report.stats.clients} tone="green" />
              <MetricCard icon={<Users />} label="Team members added" value={report.stats.teamMembers} tone="orange" />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
              <section className="rounded-[20px] border border-white/80 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-[#0D1B39]">Platform Activity Trend</h2>
                    <p className="text-xs text-slate-400">Monthly volume across logins, messages, works, invoices, projects, and admin actions.</p>
                  </div>
                  <BarChart3 className="h-5 w-5 text-[#0A4FE8]" />
                </div>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.monthly}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip cursor={{ fill: "rgba(10,79,232,0.06)" }} />
                      <Bar dataKey="logins" stackId="a" fill="#7C3AED" radius={[0, 0, 4, 4]} />
                      <Bar dataKey="messages" stackId="a" fill="#18A058" />
                      <Bar dataKey="works" stackId="a" fill="#EA580C" />
                      <Bar dataKey="invoices" stackId="a" fill="#0EA5E9" />
                      <Bar dataKey="projects" stackId="a" fill="#F43F5E" />
                      <Bar dataKey="adminActions" stackId="a" fill="#0A4FE8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-[20px] border border-white/80 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-[#0D1B39]">Activity Mix</h2>
                    <p className="text-xs text-slate-400">Grouped by platform area.</p>
                  </div>
                  <PieChart className="h-5 w-5 text-[#0A4FE8]" />
                </div>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie data={report.categoryBreakdown} dataKey="count" nameKey="category" outerRadius={96} innerRadius={54} paddingAngle={3}>
                        {report.categoryBreakdown.map((entry, index) => (
                          <Cell key={entry.category} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {report.categoryBreakdown.slice(0, 6).map((item, index) => (
                    <div key={item.category} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                        <span className="truncate">{item.category}</span>
                      </span>
                      <span className="text-xs font-bold text-[#0D1B39]">{formatNumber(item.count)}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
              <section className="rounded-[20px] border border-white/80 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-base font-bold text-[#0D1B39]">Top Actors</h2>
                  <p className="text-xs text-slate-400">Team members and admins with activity in this period.</p>
                </div>
                <div className="max-h-[560px] overflow-y-auto">
                  {filteredActors.length === 0 ? (
                    <EmptyState label="No actors match this search." />
                  ) : (
                    filteredActors.slice(0, 18).map((actor) => (
                      <div key={`${actor.kind}-${actor.name}`} className="flex items-center gap-3 border-b border-slate-50 px-5 py-3 last:border-0">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold ${
                          actor.isAdmin ? "bg-blue-50 text-[#0A4FE8]" : "bg-green-50 text-green-700"
                        }`}>
                          {actor.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-[#0D1B39]">{actor.name}</p>
                          <p className="text-xs capitalize text-slate-400">{actor.kind} · Last seen {timeAgo(actor.lastSeen)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-[#0D1B39]">{formatNumber(actor.events)}</p>
                          <p className="text-[11px] text-slate-400">events</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-[20px] border border-white/80 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="text-base font-bold text-[#0D1B39]">Recent Activities</h2>
                    <p className="text-xs text-slate-400">Who did what and when.</p>
                  </div>
                  <Clock className="h-5 w-5 text-[#0A4FE8]" />
                </div>
                <div className="max-h-[560px] overflow-y-auto">
                  {filteredActivities.length === 0 ? (
                    <EmptyState label="No activity matches this search." />
                  ) : (
                    filteredActivities.slice(0, 40).map((item) => {
                      const { noun, verb } = prettyAction(item.action);
                      return (
                        <div key={`${item.id}-${item.created_at}`} className="flex gap-3 border-b border-slate-50 px-5 py-3 last:border-0">
                          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
                            item.actor_is_admin ? "bg-blue-50 text-[#0A4FE8]" : "bg-slate-100 text-slate-500"
                          }`}>
                            {item.actor_is_admin ? <ShieldCheck className="h-4 w-4" /> : item.actor_name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm leading-5 text-[#0D1B39]">
                              <span className="font-bold">{item.actor_name}</span>
                              <span className="text-slate-500"> {verb} </span>
                              <span className="text-slate-500">{noun}</span>
                              {item.resource_label && (
                                <>
                                  <span className="text-slate-400"> · </span>
                                  <span className="font-semibold">{item.resource_label}</span>
                                </>
                              )}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {formatDateTime(item.created_at)} · {item.page}
                            </p>
                          </div>
                          <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300" />
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </div>

            <section className="rounded-[20px] border border-white/80 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[#0D1B39]">Data Sources</h2>
                  <p className="text-xs text-slate-400">Counts pulled into this report for the selected period.</p>
                </div>
                <ArrowDownToLine className="h-5 w-5 text-[#0A4FE8]" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {availableSources.map((source) => (
                  <div key={source.key} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold text-slate-500">{source.label}</p>
                    <p className="mt-1 text-xl font-bold text-[#0D1B39]">{formatNumber(source.count)}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: "blue" | "purple" | "green" | "orange" }) {
  const tones = {
    blue: "bg-blue-50 text-[#0A4FE8]",
    purple: "bg-violet-50 text-violet-700",
    green: "bg-green-50 text-green-700",
    orange: "bg-orange-50 text-orange-700",
  };

  return (
    <div className="rounded-[20px] border border-white/80 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-bold text-[#0D1B39]">{formatNumber(value)}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tones[tone]}`}>
          <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center px-6 py-10 text-center text-sm font-medium text-slate-400">
      {label}
    </div>
  );
}
