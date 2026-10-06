import "server-only";

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import jsPDF from "jspdf";
import type { AuditReportPayload } from "@/lib/audit-report";

/**
 * Server-side exports for the admin app's Finance › Audit and Audit & Report
 * screens. The web draws these in the browser (jsPDF / <canvas>) and calls
 * save(); the phone has no browser to do that, so the same drawings are made
 * here and returned as files.
 */

// ---------------------------------------------------------------- Financial audit PDF

/**
 * Same layout as the web's handleDownload PDF branch
 * (src/app/admin/finance/audit/page.tsx): title, period, then a 6-column table
 * of the export rows (the header row first).
 */
export function buildFinancialAuditPdf(rows: string[][], periodLabel: string): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 46;

  const clean = (value: unknown) => String(value ?? "").replace(/₦/g, "NGN ");
  const addPageIfNeeded = () => {
    if (y <= 758) return;
    doc.addPage();
    y = 46;
  };
  const writeRow = (cells: string[], isHeader = false) => {
    addPageIfNeeded();
    doc.setFont("helvetica", isHeader ? "bold" : "normal");
    doc.setFontSize(isHeader ? 9 : 8);
    doc.text(clean(cells[0]), margin, y, { maxWidth: 94 });
    doc.text(clean(cells[1]), margin + 104, y, { maxWidth: 132 });
    doc.text(clean(cells[2]), margin + 246, y, { maxWidth: 82 });
    doc.text(clean(cells[3]), margin + 338, y, { maxWidth: 62 });
    doc.text(clean(cells[4]), margin + 410, y, { maxWidth: 62 });
    doc.text(clean(cells[5]), margin + 482, y, { maxWidth: pageWidth - margin - 482 });
    y += isHeader ? 18 : 16;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("CDS Space Financial Audit", margin, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Period: ${clean(periodLabel)}`, margin, y);
  y += 26;
  writeRow(["Section", "Metric", "Value", "Debit", "Credit", "Date"], true);
  doc.setDrawColor(225, 229, 235);
  doc.line(margin, y - 10, pageWidth - margin, y - 10);
  rows.slice(1).forEach((row) => writeRow(row.slice(0, 6)));
  return doc.output("arraybuffer");
}

/** Validates the app's posted rows: up to 2000 rows of up to 7 short strings. */
export function sanitizeExportRows(input: unknown): string[][] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 2000) return null;
  const rows: string[][] = [];
  for (const row of input) {
    if (!Array.isArray(row) || row.length > 7) return null;
    rows.push(row.map((cell) => String(cell ?? "").slice(0, 300)));
  }
  return rows;
}

// ---------------------------------------------------------------- Audit & Report PNG / PDF

const CHART_COLORS = ["#0A4FE8", "#18A058", "#EA580C", "#7C3AED", "#0EA5E9", "#F43F5E", "#64748B"];
const VERB_LABELS: Record<string, string> = {
  create: "created", update: "updated", delete: "deleted", suspend: "suspended", unsuspend: "reactivated",
  promote: "promoted", demote: "demoted", assign: "assigned", unassign: "removed", invite: "invited", send: "sent",
  login: "logged in", mark_paid: "marked paid", restore_version: "restored version", surcharge: "added surcharge", archive: "archived",
};
const FONT = "Inter, Arial, Helvetica, sans-serif";

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value || 0);
const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

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
  return { noun: noun.replace(/_/g, " "), verb: VERB_LABELS[verb] || verb.replace(/_/g, " ") };
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: SKRSContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 2) {
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

/** Port of the web's createReportCanvas (src/app/admin/audit-report/page.tsx). */
export function drawAuditReportPng(report: AuditReportPayload): { png: Buffer; width: number; height: number } {
  const width = 1600;
  const height = 2180;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#F0F5FF";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#0D1B39";
  ctx.font = `700 54px ${FONT}`;
  ctx.fillText("CDS Space Audit & Report", 80, 95);
  ctx.font = `500 25px ${FONT}`;
  ctx.fillStyle = "#64748B";
  ctx.fillText(`Period: ${report.period.from} to ${report.period.to}`, 80, 135);
  ctx.fillText(`Generated: ${formatDateTime(report.generatedAt)}`, 80, 170);

  const cards: Array<[string, number, string]> = [
    ["Tracked events", report.stats.totalTrackedEvents, "#0A4FE8"],
    ["Logins", report.stats.logins, "#7C3AED"],
    ["Messages", report.stats.messages, "#18A058"],
    ["Works & requests", report.stats.works, "#EA580C"],
    ["Invoices", report.stats.invoices, "#0EA5E9"],
    ["Active actors", report.stats.activeActors, "#F43F5E"],
  ];
  cards.forEach(([label, value, color], index) => {
    const x = 80 + (index % 3) * 480;
    const y = 235 + Math.floor(index / 3) * 175;
    roundRect(ctx, x, y, 430, 130, 24);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 8, 130);
    ctx.fillStyle = "#64748B";
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(label, x + 34, y + 42);
    ctx.fillStyle = "#0D1B39";
    ctx.font = `800 46px ${FONT}`;
    ctx.fillText(formatNumber(value), x + 34, y + 96);
  });

  ctx.fillStyle = "#0D1B39";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText("Monthly activity", 80, 625);

  const chartX = 80;
  const chartY = 670;
  const chartW = 1440;
  const chartH = 420;
  roundRect(ctx, chartX, chartY, chartW, chartH, 28);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();

  const totals = report.monthly.map((m) => m.logins + m.messages + m.works + m.invoices + m.projects + m.adminActions);
  const maxMonthly = Math.max(1, ...totals);
  const slot = (chartW - 140) / Math.max(1, report.monthly.length);
  const barWidth = Math.max(28, Math.min(70, slot - 20));
  report.monthly.forEach((row, index) => {
    const x = chartX + 80 + index * slot;
    const h = (totals[index] / maxMonthly) * 260;
    ctx.fillStyle = "#0A4FE8";
    if (h > 0) {
      roundRect(ctx, x, chartY + 315 - h, barWidth, h, Math.min(10, h / 2));
      ctx.fill();
    }
    ctx.fillStyle = "#64748B";
    ctx.font = `500 18px ${FONT}`;
    ctx.save();
    ctx.translate(x + 4, chartY + 360);
    ctx.rotate(-0.65);
    ctx.fillText(row.label, 0, 0);
    ctx.restore();
  });

  ctx.fillStyle = "#0D1B39";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText("Category mix", 80, 1170);
  ctx.fillText("Top actors", 820, 1170);

  const mixTop = report.categoryBreakdown.slice(0, 7);
  const maxMix = Math.max(1, ...mixTop.map((row) => row.count));
  mixTop.forEach((row, index) => {
    const y = 1225 + index * 55;
    ctx.fillStyle = "#334155";
    ctx.font = `600 21px ${FONT}`;
    ctx.fillText(row.category, 80, y);
    ctx.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
    roundRect(ctx, 310, y - 22, Math.max(24, (row.count / maxMix) * 390), 24, 12);
    ctx.fill();
    ctx.fillStyle = "#0D1B39";
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(formatNumber(row.count), 725, y);
  });

  report.actors.slice(0, 8).forEach((actor, index) => {
    const y = 1225 + index * 55;
    ctx.fillStyle = actor.isAdmin ? "#0A4FE8" : "#18A058";
    roundRect(ctx, 820, y - 28, 38, 38, 19);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `700 17px ${FONT}`;
    ctx.fillText(actor.name.slice(0, 1).toUpperCase(), 833, y - 4);
    ctx.fillStyle = "#0D1B39";
    ctx.font = `700 21px ${FONT}`;
    wrapText(ctx, actor.name, 875, y - 8, 390, 24, 1);
    ctx.fillStyle = "#64748B";
    ctx.font = `500 18px ${FONT}`;
    ctx.fillText(`${formatNumber(actor.events)} events`, 1320, y - 8);
    ctx.fillText(timeAgo(actor.lastSeen), 1320, y + 18);
  });

  ctx.fillStyle = "#0D1B39";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText("Recent activity", 80, 1710);

  report.recentActivities.slice(0, 8).forEach((item, index) => {
    const { noun, verb } = prettyAction(item.action);
    const y = 1760 + index * 46;
    ctx.fillStyle = item.actor_is_admin ? "#0A4FE8" : "#18A058";
    roundRect(ctx, 80, y - 25, 30, 30, 15);
    ctx.fill();
    ctx.fillStyle = "#0D1B39";
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(item.actor_name, 128, y - 6);
    ctx.fillStyle = "#64748B";
    ctx.font = `500 20px ${FONT}`;
    wrapText(ctx, `${verb} ${noun}${item.resource_label ? ` - ${item.resource_label}` : ""}`, 360, y - 6, 830, 24, 1);
    ctx.fillText(formatDateTime(item.created_at), 1230, y - 6);
  });

  return { png: canvas.toBuffer("image/png"), width, height };
}

/** The PNG on A4 pages, sliced like the web's handleDownloadPdf. */
export function auditReportPdf(png: Buffer, width: number, height: number): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const imgW = pageW - margin * 2;
  const imgH = (height * imgW) / width;
  const data = `data:image/png;base64,${png.toString("base64")}`;
  let y = margin;
  doc.addImage(data, "PNG", margin, y, imgW, imgH);
  let remaining = imgH - (pageH - margin * 2);
  while (remaining > 0) {
    doc.addPage();
    y -= pageH - margin * 2;
    doc.addImage(data, "PNG", margin, y, imgW, imgH);
    remaining -= pageH - margin * 2;
  }
  return doc.output("arraybuffer");
}

/** Same date-range rules as /api/admin/audit-report. */
export function auditReportRange(url: URL) {
  const year = new Date().getUTCFullYear();
  const defaults = { from: `${year}-01-01`, to: `${year}-12-31` };
  const from = url.searchParams.get("from") || defaults.from;
  const to = url.searchParams.get("to") || defaults.to;
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return { ...defaults, fromIso: `${defaults.from}T00:00:00.000Z`, toIso: `${defaults.to}T23:59:59.999Z` };
  }
  return { from, to, fromIso: fromDate.toISOString(), toIso: toDate.toISOString() };
}
