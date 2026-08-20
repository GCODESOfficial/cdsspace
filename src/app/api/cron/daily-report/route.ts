/**
 * End-of-day platform report.
 *
 * Point a scheduler at GET /api/cron/daily-report once a day at 23:59 WAT
 * (cron "59 22 * * *" in UTC), Authorization: Bearer CRON_SECRET. Emails a
 * detailed 24-hour report - clients, team, work, tasks, posts, finance,
 * attendance, applications, engagement - with today-vs-yesterday deltas and
 * infographic bars to the super-admin and CEO.
 */
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email-from";
import { collectDailyReport, renderDailyReportHtml } from "@/lib/daily-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RECIPIENTS = (process.env.DAILY_REPORT_RECIPIENTS || "contact.cdsspace@gmail.com,christian.john161@gmail.com")
  .split(",").map((e) => e.trim()).filter(Boolean);

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const dateLabel = new Date().toLocaleDateString("en-GB", {
    timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const metrics = await collectDailyReport();
  const html = renderDailyReportHtml(metrics, dateLabel);
  const text = `CDS Space daily report - ${dateLabel}\n\n` +
    metrics.map((m) => `${m.label}: ${Math.round(m.today).toLocaleString()} (yesterday ${Math.round(m.yesterday).toLocaleString()}${m.deltaPct === null ? "" : `, ${m.deltaPct >= 0 ? "+" : ""}${m.deltaPct}%`})`).join("\n");

  const results = await Promise.allSettled(
    RECIPIENTS.map((to) => sendEmail({ to, subject: `CDS Space daily report - ${dateLabel}`, html, text, fromName: "CDS Space Reports" })),
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;
  if (failed) console.error(`[daily-report] ${failed} recipient(s) failed`);

  return NextResponse.json({ ok: true, date: dateLabel, recipients: RECIPIENTS.length, sent, failed, metrics: metrics.length });
}
