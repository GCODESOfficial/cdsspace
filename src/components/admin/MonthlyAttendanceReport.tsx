"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface ReportMemberOption {
  id: string;
  full_name: string;
  department: string | null;
}

interface MonthlyAttendanceRow {
  member: {
    id: string;
    full_name: string;
    email: string;
    role_title: string | null;
    department: string | null;
    joined_at: string | null;
    is_active: boolean;
  };
  scheduled_work_days: number;
  elapsed_work_days: number;
  expected_attendance_days: number;
  present_days: number;
  early_days: number;
  on_time_days: number;
  late_days: number;
  half_days: number;
  check_in_count: number;
  leave_days: number;
  absent_days: number;
  incomplete_days: number;
  early_logout_days: number;
  flagged_days: number;
  total_work_minutes: number;
  overtime_minutes: number;
  attendance_rate: number;
  punctuality_rate: number;
  payroll_status: "ready" | "watch" | "review";
  review_reasons: string[];
}

interface MonthlyAttendanceData {
  ok: true;
  period: {
    month: string;
    from: string;
    to: string;
    as_of: string;
    is_complete: boolean;
  };
  totals: {
    staff: number;
    scheduled_work_days: number;
    elapsed_work_days: number;
    expected_attendance_days: number;
    present_days: number;
    early_days: number;
    on_time_days: number;
    late_days: number;
    half_days: number;
    check_in_count: number;
    leave_days: number;
    absent_days: number;
    review_count: number;
    total_work_minutes: number;
    attendance_rate: number;
  };
  rows: MonthlyAttendanceRow[];
  methodology: string;
  generated_at: string;
}

function currentMonth() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
  }).slice(0, 7);
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1, 12)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function workTime(minutes: number) {
  const hours = Math.floor(Number(minutes || 0) / 60);
  const remainder = Number(minutes || 0) % 60;
  return `${hours}h ${remainder}m`;
}

function statusLabel(status: MonthlyAttendanceRow["payroll_status"]) {
  if (status === "ready") return "Ready";
  if (status === "watch") return "Watch";
  return "Review";
}

function statusClass(status: MonthlyAttendanceRow["payroll_status"]) {
  if (status === "ready") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (status === "watch") return "bg-amber-50 text-amber-700 ring-amber-100";
  return "bg-rose-50 text-rose-700 ring-rose-100";
}

export function MonthlyAttendanceReport({
  initialMonth,
  members,
  onClose,
}: {
  initialMonth: string;
  members: ReportMemberOption[];
  onClose: () => void;
}) {
  const [month, setMonth] = useState(/^\d{4}-\d{2}$/.test(initialMonth) ? initialMonth : currentMonth());
  const [memberId, setMemberId] = useState("");
  const [report, setReport] = useState<MonthlyAttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const memberOptions = useMemo(() => {
    const options = new Map<string, ReportMemberOption>();
    for (const member of members) options.set(member.id, member);
    for (const row of report?.rows || []) {
      options.set(row.member.id, {
        id: row.member.id,
        full_name: row.member.full_name,
        department: row.member.department,
      });
    }
    return Array.from(options.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [members, report?.rows]);

  async function runReport() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (memberId) params.set("member_id", memberId);
      const response = await fetch(`/api/admin/timebook/monthly?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "Could not run monthly attendance.");
      setReport(json);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run monthly attendance.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runReport();
    // Run once when the report panel opens. Filters are applied by the Run button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function downloadPdf() {
    if (!report) return;
    const activeReport = report;
    setExporting(true);
    try {
      const [{ default: jsPDF }, { BRAND_FONT, installBrandFont }] = await Promise.all([
        import("jspdf"),
        import("@/lib/pdf/pdf-fonts"),
      ]);
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
      installBrandFont(doc);
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 28;
      const contentWidth = pageWidth - margin * 2;
      const blue = [10, 79, 232] as const;
      const navy = [13, 27, 57] as const;
      const muted = [100, 116, 139] as const;
      const light = [244, 247, 253] as const;
      let pageNumber = 1;

      function footer() {
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, pageHeight - 25, pageWidth - margin, pageHeight - 25);
        doc.setFont(BRAND_FONT, "normal");
        doc.setFontSize(7);
        doc.setTextColor(...muted);
        doc.text("Payroll decision support. Review exceptions before making deductions or adjustments.", margin, pageHeight - 12);
        doc.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 12, { align: "right" });
      }

      function pageHeader() {
        doc.setFillColor(...blue);
        doc.roundedRect(margin, 24, contentWidth, 56, 8, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont(BRAND_FONT, "bold");
        doc.setFontSize(17);
        doc.text("Monthly Attendance Report", margin + 18, 49);
        doc.setFont(BRAND_FONT, "normal");
        doc.setFontSize(9);
        doc.text(`${monthLabel(activeReport.period.month)} | Attendance through ${activeReport.period.as_of}`, margin + 18, 66);
        doc.text("CDS Space HRM", pageWidth - margin - 18, 49, { align: "right" });
        doc.setFontSize(7.5);
        doc.text(`Generated ${new Date(activeReport.generated_at).toLocaleString("en-GB")}`, pageWidth - margin - 18, 65, { align: "right" });
      }

      pageHeader();
      const cards = [
        ["Staff", activeReport.totals.staff],
        ["Present days", activeReport.totals.present_days],
        ["Check-ins", activeReport.totals.check_in_count],
        ["Early", activeReport.totals.early_days],
        ["Late / half day", activeReport.totals.late_days + activeReport.totals.half_days],
        ["Attendance", `${activeReport.totals.attendance_rate}%`],
      ] as Array<[string, string | number]>;
      const gap = 7;
      const cardWidth = (contentWidth - gap * (cards.length - 1)) / cards.length;
      cards.forEach(([label, value], index) => {
        const x = margin + index * (cardWidth + gap);
        doc.setFillColor(...light);
        doc.roundedRect(x, 91, cardWidth, 42, 5, 5, "F");
        doc.setFont(BRAND_FONT, "bold");
        doc.setTextColor(...navy);
        doc.setFontSize(12);
        doc.text(String(value), x + 9, 111);
        doc.setFont(BRAND_FONT, "normal");
        doc.setTextColor(...muted);
        doc.setFontSize(6.5);
        doc.text(label.toUpperCase(), x + 9, 124);
      });

      const columns = [
        { label: "Staff member", width: 142, align: "left" as const },
        { label: "Department", width: 70, align: "left" as const },
        { label: "Workdays", width: 44, align: "center" as const },
        { label: "To date", width: 40, align: "center" as const },
        { label: "Present", width: 40, align: "center" as const },
        { label: "Early", width: 36, align: "center" as const },
        { label: "On time", width: 40, align: "center" as const },
        { label: "Late", width: 34, align: "center" as const },
        { label: "Half", width: 34, align: "center" as const },
        { label: "Check-ins", width: 42, align: "center" as const },
        { label: "Leave", width: 35, align: "center" as const },
        { label: "Absent", width: 38, align: "center" as const },
        { label: "Rate", width: 38, align: "center" as const },
        { label: "Payroll", width: 64, align: "center" as const },
      ];
      const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
      const tableX = margin + (contentWidth - tableWidth) / 2;
      const rowHeight = 28;
      const headerHeight = 24;
      let y = 147;

      function tableHeader() {
        doc.setFillColor(...navy);
        doc.rect(tableX, y, tableWidth, headerHeight, "F");
        let x = tableX;
        doc.setFont(BRAND_FONT, "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(255, 255, 255);
        for (const column of columns) {
          const textX = column.align === "left" ? x + 5 : x + column.width / 2;
          doc.text(column.label, textX, y + 15, { align: column.align });
          x += column.width;
        }
        y += headerHeight;
      }

      tableHeader();
      for (let index = 0; index < activeReport.rows.length; index += 1) {
        const row = activeReport.rows[index];
        if (y + rowHeight > pageHeight - 38) {
          footer();
          doc.addPage("a4", "landscape");
          pageNumber += 1;
          pageHeader();
          y = 95;
          tableHeader();
        }
        if (index % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(tableX, y, tableWidth, rowHeight, "F");
        }
        const values = [
          row.member.full_name,
          row.member.department || "-",
          row.scheduled_work_days,
          row.elapsed_work_days,
          row.present_days,
          row.early_days,
          row.on_time_days,
          row.late_days,
          row.half_days,
          row.check_in_count,
          row.leave_days,
          row.absent_days,
          `${row.attendance_rate}%`,
          statusLabel(row.payroll_status),
        ];
        let x = tableX;
        values.forEach((value, columnIndex) => {
          const column = columns[columnIndex];
          doc.setFont(BRAND_FONT, columnIndex === 0 || columnIndex === values.length - 1 ? "bold" : "normal");
          doc.setFontSize(columnIndex < 2 ? 6.7 : 7);
          if (columnIndex === values.length - 1) {
            if (row.payroll_status === "ready") doc.setTextColor(5, 150, 105);
            else if (row.payroll_status === "watch") doc.setTextColor(180, 83, 9);
            else doc.setTextColor(225, 29, 72);
          } else {
            const textColor = columnIndex === 0 ? navy : muted;
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
          }
          const textX = column.align === "left" ? x + 5 : x + column.width / 2;
          const text = String(value);
          doc.text(text.length > 28 ? `${text.slice(0, 27)}...` : text, textX, y + 17, { align: column.align });
          x += column.width;
        });
        y += rowHeight;
      }
      footer();
      doc.save(`cds-monthly-attendance-${activeReport.period.month}${memberId ? `-${memberId.slice(0, 8)}` : ""}.pdf`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the PDF.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-blue-100 bg-white shadow-lg shadow-blue-100/50">
      <div className="border-b border-slate-100 bg-[#0A4FE8] px-4 py-5 text-white sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15">
              <CalendarRange className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold sm:text-xl">Monthly attendance for payroll</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-blue-100">
                Compare scheduled workdays, attendance, punctuality, leave and every recorded check-in before preparing payroll.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Close monthly attendance">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-2 lg:grid-cols-[190px_minmax(240px,1fr)_auto_auto] lg:items-end sm:p-5">
        <label>
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Payroll month</span>
          <input type="month" value={month} max={currentMonth()} onChange={(event) => setMonth(event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0D1B39] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
        </label>
        <label>
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Team member</span>
          <select value={memberId} onChange={(event) => setMemberId(event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0D1B39] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100">
            <option value="">Everyone</option>
            {memberOptions.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name}{member.department ? ` | ${member.department}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void runReport()} disabled={loading || !month}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-bold text-white shadow-md shadow-blue-200 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Run report
        </button>
        <button type="button" onClick={() => void downloadPdf()} disabled={!report || loading || exporting}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-5 text-sm font-bold text-[#0A4FE8] disabled:opacity-50">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download PDF
        </button>
      </div>

      {loading && !report ? (
        <div className="grid min-h-[360px] place-items-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" />
        </div>
      ) : report ? (
        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-[#0D1B39]">{monthLabel(report.period.month)}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {report.period.is_complete ? "Completed month" : `In progress, calculated through ${report.period.as_of}`}
              </p>
            </div>
            <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-[10.5px] font-medium leading-4 text-blue-700 sm:mt-0">
              Future workdays are not counted as absences.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <ReportStat icon={UserCheck} label="Staff" value={report.totals.staff} />
            <ReportStat icon={CheckCircle2} label="Present days" value={report.totals.present_days} />
            <ReportStat icon={Clock3} label="Check-ins" value={report.totals.check_in_count} />
            <ReportStat icon={CalendarRange} label="Early arrivals" value={report.totals.early_days} />
            <ReportStat icon={AlertTriangle} label="Absent days" value={report.totals.absent_days} tone="rose" />
            <ReportStat icon={FileText} label="Attendance rate" value={`${report.totals.attendance_rate}%`} />
          </div>

          <div className="mt-5 space-y-3 md:hidden">
            {report.rows.map((row) => (
              <article key={row.member.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#0D1B39]">{row.member.full_name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">{row.member.department || row.member.role_title || "Team member"}</p>
                  </div>
                  <PayrollStatus row={row} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <MobileMetric label="Workdays" value={row.scheduled_work_days} />
                  <MobileMetric label="Present" value={row.present_days} />
                  <MobileMetric label="Check-ins" value={row.check_in_count} />
                  <MobileMetric label="Early" value={row.early_days} />
                  <MobileMetric label="Late" value={row.late_days + row.half_days} />
                  <MobileMetric label="Absent" value={row.absent_days} alert={row.absent_days > 0} />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-[11px] text-slate-500">
                  <span>{row.attendance_rate}% attendance</span>
                  <span>{workTime(row.total_work_minutes)} worked</span>
                </div>
                {row.review_reasons.length > 0 && (
                  <p className="mt-2 text-[10.5px] leading-4 text-rose-600">{row.review_reasons.join(", ")}</p>
                )}
              </article>
            ))}
          </div>

          <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-slate-100 md:block">
            <table className="w-full min-w-[1320px] text-left">
              <thead className="bg-[#07143F] text-[10px] uppercase tracking-wider text-white">
                <tr>
                  <th className="px-4 py-3.5">Team member</th>
                  <th className="px-3 py-3.5 text-center">Workdays</th>
                  <th className="px-3 py-3.5 text-center">Elapsed</th>
                  <th className="px-3 py-3.5 text-center">Showed up</th>
                  <th className="px-3 py-3.5 text-center">Early</th>
                  <th className="px-3 py-3.5 text-center">On time</th>
                  <th className="px-3 py-3.5 text-center">Late</th>
                  <th className="px-3 py-3.5 text-center">Half day</th>
                  <th className="px-3 py-3.5 text-center">Check-ins</th>
                  <th className="px-3 py-3.5 text-center">Leave</th>
                  <th className="px-3 py-3.5 text-center">Absent</th>
                  <th className="px-3 py-3.5 text-center">Rate</th>
                  <th className="px-3 py-3.5">Payroll review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.rows.map((row) => (
                  <tr key={row.member.id} className="align-middle text-[12px] text-slate-600 hover:bg-blue-50/30">
                    <td className="px-4 py-4">
                      <p className="font-bold text-[#0D1B39]">{row.member.full_name}</p>
                      <p className="mt-0.5 text-[10.5px] text-slate-400">{row.member.department || row.member.role_title || row.member.email}</p>
                    </td>
                    <NumberCell value={row.scheduled_work_days} hint="Full month" />
                    <NumberCell value={row.elapsed_work_days} hint="Through report date" />
                    <NumberCell value={row.present_days} strong />
                    <NumberCell value={row.early_days} tone="emerald" />
                    <NumberCell value={row.on_time_days} tone="blue" />
                    <NumberCell value={row.late_days} tone={row.late_days ? "amber" : undefined} />
                    <NumberCell value={row.half_days} tone={row.half_days ? "amber" : undefined} />
                    <NumberCell value={row.check_in_count} strong />
                    <NumberCell value={row.leave_days} />
                    <NumberCell value={row.absent_days} tone={row.absent_days ? "rose" : undefined} />
                    <td className="px-3 py-4 text-center">
                      <p className="font-bold text-[#0D1B39]">{row.attendance_rate}%</p>
                      <p className="mt-0.5 text-[9px] text-slate-400">{workTime(row.total_work_minutes)}</p>
                    </td>
                    <td className="px-3 py-4">
                      <PayrollStatus row={row} />
                      {row.review_reasons.length > 0 && (
                        <p className="mt-1.5 max-w-[170px] text-[9.5px] leading-4 text-slate-400">{row.review_reasons.join(", ")}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {report.rows.length === 0 && (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
              No team member matched this report.
            </div>
          )}
          <p className="mt-4 text-[10.5px] leading-5 text-slate-400">{report.methodology}</p>
        </div>
      ) : null}
    </section>
  );
}

function ReportStat({
  icon: Icon,
  label,
  value,
  tone = "blue",
}: {
  icon: typeof UserCheck;
  label: string;
  value: string | number;
  tone?: "blue" | "rose";
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm">
      <div className={`mb-2 grid h-8 w-8 place-items-center rounded-xl ${tone === "rose" ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-[#0A4FE8]"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-[#0D1B39]">{value}</p>
    </div>
  );
}

function NumberCell({
  value,
  hint,
  strong = false,
  tone,
}: {
  value: number;
  hint?: string;
  strong?: boolean;
  tone?: "emerald" | "blue" | "amber" | "rose";
}) {
  const toneClass = tone === "emerald"
    ? "text-emerald-700"
    : tone === "blue"
      ? "text-blue-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "rose"
          ? "text-rose-700"
          : strong
            ? "text-[#0D1B39]"
            : "text-slate-600";
  return (
    <td className="px-3 py-4 text-center">
      <p className={`${strong || tone ? "font-bold" : "font-semibold"} ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[8.5px] text-slate-400">{hint}</p>}
    </td>
  );
}

function PayrollStatus({ row }: { row: MonthlyAttendanceRow }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-wide ring-1 ${statusClass(row.payroll_status)}`}>
      {statusLabel(row.payroll_status)}
    </span>
  );
}

function MobileMetric({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={`rounded-xl px-2 py-2.5 ${alert ? "bg-rose-50" : "bg-white"}`}>
      <p className={`text-base font-bold ${alert ? "text-rose-700" : "text-[#0D1B39]"}`}>{value}</p>
      <p className="mt-0.5 text-[8.5px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
