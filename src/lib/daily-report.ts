import "server-only";

import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { brandedEmailHtml } from "@/lib/email-template";

/**
 * End-of-day platform report for CDS Space leadership.
 *
 * The report always covers a COMPLETED Africa/Lagos day (the day that just
 * ended), never the day that is only starting - a run that lands just after
 * midnight still reports the day before it. Every figure is compared to the day
 * before that, and the email is rendered with HTML/CSS charts (Gmail strips
 * inline SVG and external images, so bars/columns are built from table cells).
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

// Tables that best represent "something happened on the platform" for the
// hour-by-hour chart.
const PULSE_TABLES = ["admin_activity_log", "task_board_activity", "content_items", "profiles"];

export interface MetricResult extends Metric { today: number; yesterday: number; deltaPct: number | null }

export interface DailyReport {
  /** Lagos calendar date the report covers, YYYY-MM-DD. */
  day: string;
  dateLabel: string;
  previousLabel: string;
  metrics: MetricResult[];
  hourly: number[];            // 24 buckets of platform activity for the report day
  trend: TrendSeries[];        // 7-day history for the headline metrics
}

export interface TrendSeries { key: string; label: string; money?: boolean; days: { day: string; value: number }[] }

/* ------------------------------------------------------------------ dates */

function lagosParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * The completed Lagos day this run should report on.
 *
 * The cron fires at 23:59 WAT, so a run late in the evening reports the day it
 * is in. Any run before that (including one that slips past midnight, or a
 * manual resend the next morning) reports the previous day, which is the last
 * day that actually finished.
 */
export function resolveReportDay(now: Date = new Date(), offsetDays = 0): string {
  const { date, hour } = lagosParts(now);
  const base = hour >= 22 ? date : shiftDay(date, -1);
  return offsetDays ? shiftDay(base, -offsetDays) : base;
}

export function formatDayLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function shortLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short" });
}

/* ---------------------------------------------------------------- queries */

async function runMetric(m: Metric, day: string): Promise<{ today: number; yesterday: number }> {
  const dateCol = m.dateCol || "created_at";
  const local = `(${dateCol} at time zone 'Africa/Lagos')`;
  const dayStart = `date '${day}'`;
  const extra = m.where ? ` and ${m.where}` : "";
  // FILTER must sit on the aggregate itself, so for sums it goes INSIDE coalesce.
  const todayWin = `${local} >= ${dayStart} and ${local} < ${dayStart} + interval '1 day'${extra}`;
  const yestWin = `${local} >= ${dayStart} - interval '1 day' and ${local} < ${dayStart}${extra}`;
  const expr = (win: string) => m.sumCol
    ? `coalesce(sum(${m.sumCol}) filter (where ${win}), 0)`
    : `count(*) filter (where ${win})`;
  try {
    const row = await glashMaybeOne<{ today: string; yesterday: string }>(
      `select ${expr(todayWin)} as today, ${expr(yestWin)} as yesterday
       from public.${m.table}
       where ${dateCol} is not null
         and ${local} >= ${dayStart} - interval '1 day'
         and ${local} < ${dayStart} + interval '1 day'`,
    );
    return { today: Number(row?.today || 0), yesterday: Number(row?.yesterday || 0) };
  } catch {
    return { today: 0, yesterday: 0 };
  }
}

/** Platform activity split into the 24 hours of the report day. */
async function collectHourly(day: string): Promise<number[]> {
  const buckets = new Array(24).fill(0) as number[];
  await Promise.all(PULSE_TABLES.map(async (table) => {
    const local = `(created_at at time zone 'Africa/Lagos')`;
    try {
      const rows = await glashQuery<{ h: string; n: string }>(
        `select extract(hour from ${local})::int as h, count(*) as n
         from public.${table}
         where created_at is not null
           and ${local} >= date '${day}' and ${local} < date '${day}' + interval '1 day'
         group by 1`,
      );
      for (const r of rows) {
        const h = Number(r.h);
        if (h >= 0 && h < 24) buckets[h] += Number(r.n || 0);
      }
    } catch {
      /* table absent - contributes nothing */
    }
  }));
  return buckets;
}

/** Seven-day history (report day and the six days before it) for one metric. */
async function collectSeries(m: Metric, day: string): Promise<TrendSeries> {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(day, -(6 - i)));
  const dateCol = m.dateCol || "created_at";
  const local = `(${dateCol} at time zone 'Africa/Lagos')`;
  const value = m.sumCol ? `coalesce(sum(${m.sumCol}), 0)` : "count(*)";
  const extra = m.where ? ` and ${m.where}` : "";
  const map = new Map<string, number>();
  try {
    const rows = await glashQuery<{ d: string; n: string }>(
      `select to_char(date_trunc('day', ${local}), 'YYYY-MM-DD') as d, ${value} as n
       from public.${m.table}
       where ${dateCol} is not null
         and ${local} >= date '${days[0]}' and ${local} < date '${day}' + interval '1 day'${extra}
       group by 1`,
    );
    for (const r of rows) map.set(r.d, Number(r.n || 0));
  } catch {
    /* table absent - flat zero series */
  }
  return { key: m.key, label: m.label, money: m.money, days: days.map((d) => ({ day: d, value: map.get(d) || 0 })) };
}

function deltaPct(today: number, yesterday: number): number | null {
  if (yesterday === 0) return today > 0 ? 100 : null;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

const HEADLINE_KEYS = ["signups", "tasks", "content_published", "inflows"];

export async function collectDailyReport(day: string = resolveReportDay()): Promise<DailyReport> {
  const [metrics, hourly, trend] = await Promise.all([
    Promise.all(METRICS.map(async (m) => {
      const { today, yesterday } = await runMetric(m, day);
      return { ...m, today, yesterday, deltaPct: deltaPct(today, yesterday) };
    })),
    collectHourly(day),
    Promise.all(HEADLINE_KEYS.map((k) => collectSeries(METRICS.find((m) => m.key === k)!, day))),
  ]);
  return {
    day,
    dateLabel: formatDayLabel(day),
    previousLabel: formatDayLabel(shiftDay(day, -1)),
    metrics,
    hourly,
    trend,
  };
}

/* --------------------------------------------------------------- renderers */

const BLUE = "#0A4FE8";
const GREY = "#D7DEEC";

function fmt(m: MetricResult) {
  return Math.round(m.today).toLocaleString();
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
      <tr><td style="padding:1px 0;"><div style="height:8px;width:${tw}%;min-width:2px;background:${BLUE};border-radius:4px;"></div></td></tr>
      <tr><td style="padding:1px 0;"><div style="height:8px;width:${yw}%;min-width:2px;background:${GREY};border-radius:4px;"></div></td></tr>
    </table>`;
}

function sectionTitle(text: string): string {
  return `<div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${BLUE};margin-top:26px;">${text}</div>`;
}

/** Vertical column chart: 24 hourly buckets of platform activity. */
function hourlyChart(hourly: number[]): string {
  const max = Math.max(...hourly, 1);
  const total = hourly.reduce((a, b) => a + b, 0);
  const peak = hourly.indexOf(Math.max(...hourly));
  const cols = hourly.map((v, h) => {
    const px = Math.max(2, Math.round((v / max) * 90));
    const fill = v > 0 ? BLUE : GREY;
    return `
      <td valign="bottom" align="center" style="padding:0 1px;">
        <div style="height:${px}px;background:${fill};border-radius:3px 3px 0 0;"></div>
        <div style="font-size:8px;color:#98A2B3;margin-top:3px;">${h % 3 === 0 ? String(h).padStart(2, "0") : "&nbsp;"}</div>
      </td>`;
  }).join("");
  return `
    ${sectionTitle("Activity by hour")}
    <div style="font-size:12px;color:#667085;margin:6px 0 10px 0;">${total.toLocaleString()} platform events across the day${total > 0 ? ` - busiest hour ${String(peak).padStart(2, "0")}:00 WAT` : ""}.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="height:110px;"><tr>${cols}</tr></table>`;
}

/** Small multiples: a 7-day column chart per headline metric. */
function trendCharts(trend: TrendSeries[], day: string): string {
  const cards = trend.map((s) => {
    const max = Math.max(...s.days.map((d) => d.value), 1);
    const cols = s.days.map((d) => {
      const px = Math.max(2, Math.round((d.value / max) * 58));
      const isReportDay = d.day === day;
      return `
        <td valign="bottom" align="center" style="padding:0 2px;">
          <div style="height:${px}px;background:${isReportDay ? BLUE : GREY};border-radius:3px 3px 0 0;"></div>
          <div style="font-size:8px;color:${isReportDay ? BLUE : "#98A2B3"};font-weight:${isReportDay ? 800 : 400};margin-top:3px;">${shortLabel(d.day)}</div>
        </td>`;
    }).join("");
    const week = s.days.reduce((a, d) => a + d.value, 0);
    return `
      <td width="50%" valign="top" style="padding:6px;">
        <div style="background:#ffffff;border:1px solid #e6eaf2;border-radius:12px;padding:12px;">
          <div style="font-size:12px;font-weight:800;color:#0D1B39;">${s.label}</div>
          <div style="font-size:11px;color:#98A2B3;margin-bottom:8px;">7-day total ${Math.round(week).toLocaleString()}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="height:78px;"><tr>${cols}</tr></table>
        </div>
      </td>`;
  });
  const rows: string[] = [];
  for (let i = 0; i < cards.length; i += 2) rows.push(`<tr>${cards.slice(i, i + 2).join("")}</tr>`);
  return `
    ${sectionTitle("Seven-day trend")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">${rows.join("")}</table>`;
}

/** Where the day's countable volume came from, as one stacked bar. */
function shareChart(metrics: MetricResult[]): string {
  const palette = ["#0A4FE8", "#2F80ED", "#00A3A1", "#7A5AF8", "#F2994A", "#EB5757", "#0a8f3c"];
  const groups = Array.from(new Set(metrics.map((m) => m.group)));
  const totals = groups.map((g) => ({
    group: g,
    value: metrics.filter((m) => m.group === g && !m.money).reduce((a, m) => a + m.today, 0),
  })).filter((g) => g.value > 0).sort((a, b) => b.value - a.value);
  const sum = totals.reduce((a, g) => a + g.value, 0);
  if (!sum) {
    return `${sectionTitle("Where the volume came from")}
      <div style="font-size:12px;color:#98A2B3;margin-top:6px;">No countable activity was recorded on this day.</div>`;
  }
  const segs = totals.map((g, i) => `<td width="${Math.max(1, Math.round((g.value / sum) * 100))}%" style="background:${palette[i % palette.length]};height:14px;"></td>`).join("");
  const keys = totals.map((g, i) => `
    <span style="display:inline-block;margin:0 12px 6px 0;font-size:11px;color:#475467;">
      <span style="display:inline-block;width:10px;height:8px;background:${palette[i % palette.length]};border-radius:3px;"></span>
      ${g.group} <strong style="color:#0D1B39;">${g.value.toLocaleString()}</strong> (${Math.round((g.value / sum) * 100)}%)
    </span>`).join("");
  return `
    ${sectionTitle("Where the volume came from")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;border-radius:7px;overflow:hidden;"><tr>${segs}</tr></table>
    <div>${keys}</div>`;
}

/** Diverging bars for the largest movements against the previous day. */
function moversChart(metrics: MetricResult[], previousLabel: string): string {
  const movers = metrics
    .filter((m) => m.deltaPct !== null && (m.today > 0 || m.yesterday > 0))
    .sort((a, b) => Math.abs(b.deltaPct as number) - Math.abs(a.deltaPct as number))
    .slice(0, 6);
  if (!movers.length) {
    return `${sectionTitle("Biggest movements")}
      <div style="font-size:12px;color:#98A2B3;margin-top:6px;">Nothing moved against ${previousLabel}.</div>`;
  }
  const scale = Math.max(...movers.map((m) => Math.abs(m.deltaPct as number)), 1);
  const rows = movers.map((m) => {
    const pct = m.deltaPct as number;
    const w = Math.max(2, Math.round((Math.abs(pct) / scale) * 50));
    const up = pct >= 0;
    const left = up
      ? `<td width="50%" align="right"></td>`
      : `<td width="50%" align="right"><div style="height:10px;width:${w * 2}%;background:#d1293d;border-radius:5px 0 0 5px;margin-left:auto;"></div></td>`;
    const right = up
      ? `<td width="50%"><div style="height:10px;width:${w * 2}%;background:#0a8f3c;border-radius:0 5px 5px 0;"></div></td>`
      : `<td width="50%"></td>`;
    return `
      <tr>
        <td style="padding:7px 0 2px 0;">
          <div style="font-size:12px;color:#0D1B39;font-weight:600;">${m.label} <span style="float:right;">${deltaBadge(pct)}</span></div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;"><tr>${left}${right}</tr></table>
        </td>
      </tr>`;
  }).join("");
  return `
    ${sectionTitle("Biggest movements")}
    <div style="font-size:12px;color:#667085;margin-top:6px;">Change against ${previousLabel}.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

/** Build the branded HTML report. */
export function renderDailyReportHtml(report: DailyReport): string {
  const { metrics, dateLabel, previousLabel } = report;
  const groups = Array.from(new Set(metrics.map((m) => m.group)));

  const sections = groups.map((group) => {
    const items = metrics.filter((m) => m.group === group);
    const rows = items.map((m) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eef1f7;">
          <div style="font-size:13px;color:#0D1B39;font-weight:600;">${m.label}
            <span style="float:right;font-weight:800;">${fmt(m)} &nbsp; ${deltaBadge(m.deltaPct)}</span>
          </div>
          ${bar(m.today, m.yesterday)}
          <div style="font-size:11px;color:#98A2B3;margin-top:3px;">${dateLabel.split(",")[0]} vs previous day (${Math.round(m.yesterday).toLocaleString()})</div>
        </td>
      </tr>`).join("");
    return `
      <div style="margin-top:22px;">
        <div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${BLUE};">${group}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </div>`;
  }).join("");

  // Headline tiles: the 4 highest-signal metrics.
  const tiles = HEADLINE_KEYS.map((k) => metrics.find((m) => m.key === k)).filter(Boolean).map((m) => `
    <td width="25%" style="padding:6px;">
      <div style="background:#F5F8FF;border:1px solid #e6eaf2;border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:24px;font-weight:900;color:#0D1B39;">${fmt(m as MetricResult)}</div>
        <div style="font-size:10px;color:#667085;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:4px 0;">${(m as MetricResult).label}</div>
        ${deltaBadge((m as MetricResult).deltaPct)}
      </div>
    </td>`).join("");

  const legend = `
    <div style="margin-top:8px;font-size:11px;color:#667085;">
      <span style="display:inline-block;width:10px;height:8px;background:${BLUE};border-radius:3px;"></span> ${dateLabel.split(",")[0]}
      &nbsp;&nbsp;
      <span style="display:inline-block;width:10px;height:8px;background:${GREY};border-radius:3px;"></span> Previous day
    </div>`;

  const body = `
    <p style="margin:0 0 4px 0;font-size:14px;color:#0D1B39;font-weight:700;">Platform report - ${dateLabel}</p>
    <p style="margin:0 0 16px 0;color:#667085;font-size:13px;">Everything that happened across CDS Space on ${dateLabel}, compared with ${previousLabel}.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${tiles}</tr></table>
    ${legend}
    ${hourlyChart(report.hourly)}
    ${trendCharts(report.trend, report.day)}
    ${shareChart(metrics)}
    ${moversChart(metrics, previousLabel)}
    ${sections}
    <p style="margin:22px 0 0 0;font-size:11px;color:#98A2B3;">Sent after the day closes at 23:59 WAT and always covers the completed Africa/Lagos day. Money columns are aggregate totals across currencies.</p>`;

  return brandedEmailHtml(body, { eyebrow: "Daily report", preheader: `CDS Space platform report - ${dateLabel}` });
}

export function renderDailyReportText(report: DailyReport): string {
  return `CDS Space daily report - ${report.dateLabel}\n\n`
    + report.metrics.map((m) => `${m.label}: ${Math.round(m.today).toLocaleString()} (previous day ${Math.round(m.yesterday).toLocaleString()}${m.deltaPct === null ? "" : `, ${m.deltaPct >= 0 ? "+" : ""}${m.deltaPct}%`})`).join("\n");
}
