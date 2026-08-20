import "server-only";

import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { brandedEmailHtml } from "@/lib/email-template";

/**
 * End-of-day platform report for CDS Space leadership. Aggregates the last
 * Africa/Lagos day across every domain, compares each figure to the day before,
 * and renders an email-safe branded report (HTML/CSS bars, since Gmail strips
 * inline SVG). Sent by the daily-report cron at 23:59 WAT.
 */

export interface Metric {
  key: string;
  label: string;
  group: string;
  table: string;
  dateCol?: string;
  where?: string;
  sumCol?: string;   // when set, sums this column instead of counting rows
  money?: boolean;
}

// Each metric is defensive: a missing table/column yields 0, never a crash.
const METRICS: Metric[] = [
  // Clients
  { key: "signups", label: "New client sign-ups", group: "Clients", table: "profiles" },
  { key: "crm_clients", label: "New CRM clients", group: "Clients", table: "clients" },
  { key: "consultations", label: "Consultation requests", group: "Clients", table: "consultation_requests" },
  { key: "subscriptions", label: "New subscriptions", group: "Clients", table: "subscriptions" },
  // Team & attendance
  { key: "team_new", label: "New team members", group: "Team & attendance", table: "team_members" },
  { key: "checkins", label: "Attendance check-ins", group: "Team & attendance", table: "biometric_attendance_events" },
  // Work & tasks
  { key: "tasks", label: "Task activity", group: "Work & tasks", table: "task_board_activity" },
  { key: "deliveries", label: "Client deliveries", group: "Work & tasks", table: "client_deliveries" },
  { key: "brand_identities", label: "Brand identities", group: "Work & tasks", table: "brand_identity_deliveries" },
  // Content & posts
  { key: "content_created", label: "Content created", group: "Content & posts", table: "content_items" },
  { key: "content_published", label: "Posts published", group: "Content & posts", table: "content_items", dateCol: "published_at", where: "status = 'published'" },
  // Finance
  { key: "invoices", label: "Invoices raised", group: "Finance", table: "finance_invoices" },
  { key: "invoice_value", label: "Invoice value", group: "Finance", table: "finance_invoices", sumCol: "total", money: true },
  { key: "inflows", label: "Revenue inflows", group: "Finance", table: "finance_inflows", sumCol: "amount", money: true },
  { key: "receipts", label: "Payments received", group: "Finance", table: "finance_receipts", sumCol: "amount", dateCol: "paid_at", money: true },
  { key: "merch", label: "Merch orders", group: "Finance", table: "merch_orders" },
  // Applications
  { key: "applications", label: "Job applications", group: "Applications", table: "applications" },
  { key: "role_apps", label: "Role applications", group: "Applications", table: "role_applications" },
  { key: "screening", label: "Screening candidates", group: "Applications", table: "screening_candidates" },
  // Engagement (note: dedicated website-visitor analytics is not yet instrumented;
  // platform actions is the closest whole-platform engagement signal today).
  { key: "activity", label: "Platform actions", group: "Engagement", table: "admin_activity_log" },
];

export interface MetricResult extends Metric { today: number; yesterday: number; deltaPct: number | null }

const DAY_START = "date_trunc('day', now() at time zone 'Africa/Lagos')";

async function runMetric(m: Metric): Promise<{ today: number; yesterday: number }> {
  const dateCol = m.dateCol || "created_at";
  const local = `(${dateCol} at time zone 'Africa/Lagos')`;
  const extra = m.where ? ` and ${m.where}` : "";
  // FILTER must sit on the aggregate itself, so for sums it goes INSIDE coalesce.
  const todayWin = `${local} >= ${DAY_START}${extra}`;
  const yestWin = `${local} >= ${DAY_START} - interval '1 day' and ${local} < ${DAY_START}${extra}`;
  const expr = (win: string) => m.sumCol
    ? `coalesce(sum(${m.sumCol}) filter (where ${win}), 0)`
    : `count(*) filter (where ${win})`;
  try {
    const row = await glashMaybeOne<{ today: string; yesterday: string }>(
      `select ${expr(todayWin)} as today, ${expr(yestWin)} as yesterday
       from public.${m.table}
       where ${dateCol} is not null and ${local} >= ${DAY_START} - interval '1 day'`,
    );
    return { today: Number(row?.today || 0), yesterday: Number(row?.yesterday || 0) };
  } catch {
    return { today: 0, yesterday: 0 };
  }
}

function deltaPct(today: number, yesterday: number): number | null {
  if (yesterday === 0) return today > 0 ? 100 : null;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

export async function collectDailyReport(): Promise<MetricResult[]> {
  return Promise.all(
    METRICS.map(async (m) => {
      const { today, yesterday } = await runMetric(m);
      return { ...m, today, yesterday, deltaPct: deltaPct(today, yesterday) };
    }),
  );
}

function fmt(m: MetricResult) {
  if (m.money) return Math.round(m.today).toLocaleString();
  return m.today.toLocaleString();
}

function deltaBadge(pct: number | null): string {
  if (pct === null) return `<span style="color:#98A2B3;font-size:12px;font-weight:700;">-</span>`;
  const up = pct >= 0;
  const color = up ? "#0a8f3c" : "#d1293d";
  const arrow = up ? "&#9650;" : "&#9660;";
  return `<span style="color:${color};font-size:12px;font-weight:700;">${arrow} ${Math.abs(pct)}%</span>`;
}

function bar(today: number, yesterday: number): string {
  const max = Math.max(today, yesterday, 1);
  const tw = Math.round((today / max) * 100);
  const yw = Math.round((yesterday / max) * 100);
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
      <tr><td style="padding:1px 0;"><div style="height:8px;width:${tw}%;min-width:2px;background:#0A4FE8;border-radius:4px;"></div></td></tr>
      <tr><td style="padding:1px 0;"><div style="height:8px;width:${yw}%;min-width:2px;background:#D7DEEC;border-radius:4px;"></div></td></tr>
    </table>`;
}

/** Build the branded HTML report from collected metrics. */
export function renderDailyReportHtml(metrics: MetricResult[], dateLabel: string): string {
  const groups = Array.from(new Set(metrics.map((m) => m.group)));

  const sections = groups.map((group) => {
    const items = metrics.filter((m) => m.group === group);
    const rows = items.map((m) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eef1f7;">
          <div style="display:flex;justify-content:space-between;">
            <span style="font-size:13px;color:#0D1B39;font-weight:600;">${m.label}</span>
            <span style="font-size:13px;color:#0D1B39;font-weight:800;">${m.money ? "" : ""}${fmt(m)} &nbsp; ${deltaBadge(m.deltaPct)}</span>
          </div>
          ${bar(m.today, m.yesterday)}
          <div style="font-size:11px;color:#98A2B3;margin-top:3px;">Today vs yesterday (${m.yesterday.toLocaleString()})</div>
        </td>
      </tr>`).join("");
    return `
      <div style="margin-top:22px;">
        <div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#0A4FE8;">${group}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </div>`;
  }).join("");

  // Headline tiles: the 4 highest-signal metrics.
  const tileKeys = ["signups", "tasks", "content_published", "inflows"];
  const tiles = tileKeys.map((k) => metrics.find((m) => m.key === k)).filter(Boolean).map((m) => `
    <td width="25%" style="padding:6px;">
      <div style="background:#F5F8FF;border:1px solid #e6eaf2;border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:24px;font-weight:900;color:#0D1B39;">${fmt(m as MetricResult)}</div>
        <div style="font-size:10px;color:#667085;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:4px 0;">${(m as MetricResult).label}</div>
        ${deltaBadge((m as MetricResult).deltaPct)}
      </div>
    </td>`).join("");

  const legend = `
    <div style="margin-top:8px;font-size:11px;color:#667085;">
      <span style="display:inline-block;width:10px;height:8px;background:#0A4FE8;border-radius:3px;"></span> Today
      &nbsp;&nbsp;
      <span style="display:inline-block;width:10px;height:8px;background:#D7DEEC;border-radius:3px;"></span> Yesterday
    </div>`;

  const body = `
    <p style="margin:0 0 4px 0;font-size:14px;color:#0D1B39;font-weight:700;">Platform report - ${dateLabel}</p>
    <p style="margin:0 0 16px 0;color:#667085;font-size:13px;">A 24-hour snapshot across every part of CDS Space, each figure compared to the previous day.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${tiles}</tr></table>
    ${legend}
    ${sections}
    <p style="margin:22px 0 0 0;font-size:11px;color:#98A2B3;">Generated automatically at 23:59 WAT. Figures use the Africa/Lagos day. Money columns are aggregate totals across currencies.</p>`;

  return brandedEmailHtml(body, { eyebrow: "Daily report", preheader: `CDS Space 24-hour platform report - ${dateLabel}` });
}
